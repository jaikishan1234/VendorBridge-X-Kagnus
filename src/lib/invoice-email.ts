import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activityEvents,
  invoiceEmailDeliveryClaims,
  invoiceEmailDeliveries,
} from "@/db/schema";
import { getInvoiceDocument, type InvoiceDocument } from "@/lib/invoices";
import {
  InvoiceIssuerConfigurationError,
  renderInvoicePdf,
} from "@/lib/invoice-pdf";

const requiredSmtpEnvironmentVariables = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_APP_PASSWORD",
  "INVOICE_EMAIL_FROM",
] as const;
const invoiceEmailClaimDuration = "10 minutes";

export class InvoiceEmailConfigurationError extends Error {}
export class InvoiceEmailNotFoundError extends Error {}
export class InvoiceEmailAlreadySentError extends Error {}
export class InvoiceEmailSendInProgressError extends Error {}
export class InvoiceEmailDeliveryFailedError extends Error {}
export class InvoiceEmailAuditPersistenceError extends Error {}
/**
 * SMTP may already have accepted the message when recording its outcome
 * fails. Migration 0016 has no durable uncertainty state, so retain the
 * active lease and require operator review before a later retry.
 */
export class InvoiceEmailOutcomeUncertainError extends Error {}

type SmtpConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  appPassword: string;
  from: string;
};

export function getSmtpConfiguration(): SmtpConfiguration {
  const missing = requiredSmtpEnvironmentVariables.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new InvoiceEmailConfigurationError(
      `Missing required SMTP configuration: ${missing.join(", ")}.`,
    );
  }

  const port = Number(process.env.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new InvoiceEmailConfigurationError("SMTP_PORT must be a valid TCP port.");
  }

  const secureValue = process.env.SMTP_SECURE!.trim().toLowerCase();
  if (secureValue !== "true" && secureValue !== "false") {
    throw new InvoiceEmailConfigurationError("SMTP_SECURE must be true or false.");
  }

  return {
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: secureValue === "true",
    user: process.env.SMTP_USER!.trim(),
    appPassword: process.env.SMTP_APP_PASSWORD!.trim(),
    from: process.env.INVOICE_EMAIL_FROM!.trim(),
  };
}

function invoiceAttachmentFilename(invoiceNumber: string): string {
  const safeInvoiceNumber = invoiceNumber
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "invoice";
  return `${safeInvoiceNumber}.pdf`;
}

function deliveryFailureReason(error: unknown): string {
  if (error instanceof InvoiceEmailConfigurationError) {
    return "SMTP configuration is invalid.";
  }

  return "Invoice email could not be sent.";
}

async function hasSentDelivery(invoiceId: string) {
  const [existingSentDelivery] = await db
    .select({ id: invoiceEmailDeliveries.id })
    .from(invoiceEmailDeliveries)
    .where(
      and(
        eq(invoiceEmailDeliveries.invoiceId, invoiceId),
        eq(invoiceEmailDeliveries.status, "SENT"),
      ),
    )
    .limit(1);
  return Boolean(existingSentDelivery);
}

async function acquireInvoiceEmailClaim(invoiceId: string, actorUserId: string) {
  const claimToken = randomUUID();
  const [claim] = await db
    .insert(invoiceEmailDeliveryClaims)
    .values({
      invoiceId,
      claimToken,
      claimedByUserId: actorUserId,
      claimedAt: sql`now()`,
      expiresAt: sql`now() + ${invoiceEmailClaimDuration}::interval`,
    })
    .onConflictDoUpdate({
      target: invoiceEmailDeliveryClaims.invoiceId,
      set: {
        claimToken,
        claimedByUserId: actorUserId,
        claimedAt: sql`now()`,
        expiresAt: sql`now() + ${invoiceEmailClaimDuration}::interval`,
      },
      where: lte(invoiceEmailDeliveryClaims.expiresAt, sql`now()`),
    })
    .returning({ claimToken: invoiceEmailDeliveryClaims.claimToken });

  return claim?.claimToken === claimToken ? claimToken : null;
}

async function releaseInvoiceEmailClaim(invoiceId: string, claimToken: string) {
  await db
    .delete(invoiceEmailDeliveryClaims)
    .where(
      and(
        eq(invoiceEmailDeliveryClaims.invoiceId, invoiceId),
        eq(invoiceEmailDeliveryClaims.claimToken, claimToken),
      ),
    );
}

async function finalizeInvoiceEmailDelivery(
  invoice: InvoiceDocument,
  actorUserId: string,
  claimToken: string,
  status: "SENT" | "FAILED",
  failureReason: string | null,
) {
  await db.transaction(async (tx) => {
    const [claim] = await tx
      .delete(invoiceEmailDeliveryClaims)
      .where(
        and(
          eq(invoiceEmailDeliveryClaims.invoiceId, invoice.id),
          eq(invoiceEmailDeliveryClaims.claimToken, claimToken),
        ),
      )
      .returning({ invoiceId: invoiceEmailDeliveryClaims.invoiceId });
    if (!claim) throw new InvoiceEmailSendInProgressError();

    await tx.insert(invoiceEmailDeliveries).values({
      invoiceId: invoice.id,
      recipientEmail: invoice.vendor.email,
      status,
      failureReason,
    });
    await tx.insert(activityEvents).values({
      eventType: status === "SENT" ? "INVOICE_EMAIL_SENT" : "INVOICE_EMAIL_FAILED",
      actorUserId,
      isSystemGenerated: false,
      affectedEntityType: "INVOICE",
      affectedEntityId: invoice.id,
      vendorId: invoice.vendorId,
      purchaseOrderId: invoice.purchaseOrderId,
      invoiceId: invoice.id,
      metadata: {},
      occurredAt: new Date(),
    });
  });
}

async function persistDeliveryOutcome(
  invoice: InvoiceDocument,
  actorUserId: string,
  claimToken: string,
  status: "SENT" | "FAILED",
  failureReason: string | null,
) {
  try {
    await finalizeInvoiceEmailDelivery(
      invoice,
      actorUserId,
      claimToken,
      status,
      failureReason,
    );
  } catch (error) {
    if (error instanceof InvoiceEmailSendInProgressError) throw error;
    console.error(`Unable to persist ${status.toLowerCase()} invoice-email delivery:`, {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    throw new InvoiceEmailAuditPersistenceError();
  }
}

/**
 * Sends one invoice PDF to the vendor email stored in the database. An atomic
 * row lease serializes claims across application processes. The lease expires
 * after ten minutes, allowing recovery from a crashed claimant; a result may
 * only be persisted by the matching claim token.
 *
 * SMTP acceptance confirms handoff to the provider, not final inbox delivery.
 */
export async function sendInvoiceEmail(invoiceId: string, actorUserId: string) {
  const invoice = await getInvoiceDocument(invoiceId);
  if (!invoice) throw new InvoiceEmailNotFoundError();

  if (await hasSentDelivery(invoiceId)) throw new InvoiceEmailAlreadySentError();

  const claimToken = await acquireInvoiceEmailClaim(invoiceId, actorUserId);
  if (!claimToken) {
    if (await hasSentDelivery(invoiceId)) throw new InvoiceEmailAlreadySentError();
    throw new InvoiceEmailSendInProgressError();
  }

  let finalized = false;
  let retainClaimForUncertainOutcome = false;
  try {
    // A sender may have completed between the first SENT check and this claim.
    if (await hasSentDelivery(invoiceId)) throw new InvoiceEmailAlreadySentError();

    let pdf: Buffer;
    try {
      pdf = await renderInvoicePdf(invoice);
    } catch (error) {
      await persistDeliveryOutcome(
        invoice,
        actorUserId,
        claimToken,
        "FAILED",
        deliveryFailureReason(error),
      );
      finalized = true;
      if (error instanceof InvoiceIssuerConfigurationError) throw error;
      throw new InvoiceEmailDeliveryFailedError();
    }

    let smtp: SmtpConfiguration;
    try {
      smtp = getSmtpConfiguration();
    } catch (error) {
      await persistDeliveryOutcome(
        invoice,
        actorUserId,
        claimToken,
        "FAILED",
        deliveryFailureReason(error),
      );
      finalized = true;
      throw error;
    }

    let smtpSubmissionStarted = false;
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.appPassword },
      });
      smtpSubmissionStarted = true;
      await transporter.sendMail({
        from: smtp.from,
        to: invoice.vendor.email,
        subject: `Invoice ${invoice.invoiceNumber} for PO ${invoice.purchaseOrderNumber}`,
        text: [
          `Dear ${invoice.vendor.contactName || invoice.vendor.name},`,
          "",
          `Please find invoice ${invoice.invoiceNumber} for purchase order ${invoice.purchaseOrderNumber} attached.`,
          "",
          "Regards,",
          "VendorBridge Procurement",
        ].join("\n"),
        attachments: [
          {
            filename: invoiceAttachmentFilename(invoice.invoiceNumber),
            content: pdf,
            contentType: "application/pdf",
          },
        ],
      });
    } catch (error) {
      try {
        await persistDeliveryOutcome(
          invoice,
          actorUserId,
          claimToken,
          "FAILED",
          deliveryFailureReason(error),
        );
        finalized = true;
      } catch (auditError) {
        if (
          smtpSubmissionStarted &&
          auditError instanceof InvoiceEmailAuditPersistenceError
        ) {
          retainClaimForUncertainOutcome = true;
          throw new InvoiceEmailOutcomeUncertainError();
        }
        throw auditError;
      }
      throw new InvoiceEmailDeliveryFailedError();
    }

    try {
      await persistDeliveryOutcome(invoice, actorUserId, claimToken, "SENT", null);
      finalized = true;
    } catch (error) {
      if (error instanceof InvoiceEmailAuditPersistenceError) {
        retainClaimForUncertainOutcome = true;
        throw new InvoiceEmailOutcomeUncertainError();
      }
      throw error;
    }
    return { invoiceNumber: invoice.invoiceNumber, recipientEmail: invoice.vendor.email };
  } finally {
    if (!finalized && !retainClaimForUncertainOutcome) {
      try {
        await releaseInvoiceEmailClaim(invoiceId, claimToken);
      } catch (error) {
        console.error("Unable to release invoice-email claim:", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  }
}
