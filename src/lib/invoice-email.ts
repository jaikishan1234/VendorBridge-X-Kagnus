import nodemailer from "nodemailer";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoiceEmailDeliveries } from "@/db/schema";
import { getInvoiceDocument } from "@/lib/invoices";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

const requiredSmtpEnvironmentVariables = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_APP_PASSWORD",
  "INVOICE_EMAIL_FROM",
] as const;

const invoiceEmailSendsInProgress = new Set<string>();

export class InvoiceEmailConfigurationError extends Error {}
export class InvoiceEmailNotFoundError extends Error {}
export class InvoiceEmailAlreadySentError extends Error {}
export class InvoiceEmailSendInProgressError extends Error {}
export class InvoiceEmailDeliveryFailedError extends Error {}
export class InvoiceEmailAuditPersistenceError extends Error {}

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

async function recordFailedDelivery(invoiceId: string, recipientEmail: string, error: unknown) {
  try {
    await db.insert(invoiceEmailDeliveries).values({
      invoiceId,
      recipientEmail,
      status: "FAILED",
      failureReason: deliveryFailureReason(error),
    });
  } catch (auditError) {
    console.error("Unable to persist failed invoice-email delivery:", {
      name: auditError instanceof Error ? auditError.name : "UnknownError",
    });
    throw new InvoiceEmailAuditPersistenceError();
  }
}

/**
 * Sends one invoice PDF to the vendor email stored in the database. SMTP
 * acceptance confirms handoff to the provider, not final inbox delivery.
 */
export async function sendInvoiceEmail(invoiceId: string) {
  if (invoiceEmailSendsInProgress.has(invoiceId)) {
    throw new InvoiceEmailSendInProgressError();
  }
  invoiceEmailSendsInProgress.add(invoiceId);

  try {
    const invoice = await getInvoiceDocument(invoiceId);
    if (!invoice) throw new InvoiceEmailNotFoundError();

    const [existingSentDelivery] = await db
      .select({ id: invoiceEmailDeliveries.id })
      .from(invoiceEmailDeliveries)
      .where(
        and(
          eq(invoiceEmailDeliveries.invoiceId, invoice.id),
          eq(invoiceEmailDeliveries.status, "SENT"),
        ),
      )
      .limit(1);
    if (existingSentDelivery) throw new InvoiceEmailAlreadySentError();

    let pdf: Buffer;
    try {
      pdf = await renderInvoicePdf(invoice);
    } catch (error) {
      await recordFailedDelivery(invoice.id, invoice.vendor.email, error);
      throw new InvoiceEmailDeliveryFailedError();
    }

    let smtp: SmtpConfiguration;
    try {
      smtp = getSmtpConfiguration();
    } catch (error) {
      await recordFailedDelivery(invoice.id, invoice.vendor.email, error);
      throw error;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.appPassword },
      });
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
      await recordFailedDelivery(invoice.id, invoice.vendor.email, error);
      throw new InvoiceEmailDeliveryFailedError();
    }

    try {
      await db.insert(invoiceEmailDeliveries).values({
        invoiceId: invoice.id,
        recipientEmail: invoice.vendor.email,
        status: "SENT",
        failureReason: null,
      });
    } catch (error) {
      console.error("Unable to persist sent invoice-email delivery:", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      throw new InvoiceEmailAuditPersistenceError();
    }

    return { invoiceNumber: invoice.invoiceNumber, recipientEmail: invoice.vendor.email };
  } finally {
    invoiceEmailSendsInProgress.delete(invoiceId);
  }
}
