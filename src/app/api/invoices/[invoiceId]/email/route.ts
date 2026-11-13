import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authorization";
import {
  InvoiceEmailAlreadySentError,
  InvoiceEmailAuditPersistenceError,
  InvoiceEmailConfigurationError,
  InvoiceEmailDeliveryFailedError,
  InvoiceEmailNotFoundError,
  InvoiceEmailOutcomeUncertainError,
  InvoiceEmailSendInProgressError,
  sendInvoiceEmail,
} from "@/lib/invoice-email";
import { InvoiceIssuerConfigurationError } from "@/lib/invoice-pdf";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { invoiceId } = await params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
  }

  if (await request.text()) {
    return NextResponse.json(
      { message: "Invoice email requests do not accept a request body." },
      { status: 400 },
    );
  }

  try {
    const delivery = await sendInvoiceEmail(invoiceId, authorization.user.id);
    return NextResponse.json({
      message: "Invoice email submitted to SMTP.",
      invoiceNumber: delivery.invoiceNumber,
    });
  } catch (error) {
    if (error instanceof InvoiceEmailNotFoundError) {
      return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
    }
    if (
      error instanceof InvoiceEmailAlreadySentError ||
      error instanceof InvoiceEmailSendInProgressError
    ) {
      return NextResponse.json(
        { message: "An invoice email has already been sent or is being sent." },
        { status: 409 },
      );
    }
    if (error instanceof InvoiceEmailConfigurationError) {
      console.error("Invoice SMTP configuration error:", error.message);
      return NextResponse.json(
        { message: "Invoice email configuration is invalid." },
        { status: 500 },
      );
    }
    if (error instanceof InvoiceIssuerConfigurationError) {
      console.error("Invoice PDF configuration error:", error.message);
      return NextResponse.json(
        { message: "Invoice PDF configuration is invalid." },
        { status: 500 },
      );
    }
    if (error instanceof InvoiceEmailDeliveryFailedError) {
      return NextResponse.json({ message: "Unable to send the invoice email." }, { status: 502 });
    }
    if (error instanceof InvoiceEmailOutcomeUncertainError) {
      return NextResponse.json(
        { message: "Invoice email outcome is uncertain. Do not retry until delivery is reviewed." },
        { status: 502 },
      );
    }
    if (error instanceof InvoiceEmailAuditPersistenceError) {
      return NextResponse.json(
        { message: "Unable to confirm invoice email delivery." },
        { status: 500 },
      );
    }

    console.error("Invoice email delivery error:", error);
    return NextResponse.json({ message: "Unable to send the invoice email." }, { status: 500 });
  }
}
