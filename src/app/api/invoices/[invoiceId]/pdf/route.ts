import { NextResponse } from "next/server";
import { z } from "zod";
import { getInvoiceDocument } from "@/lib/invoices";
import {
  InvoiceIssuerConfigurationError,
  renderInvoicePdf,
} from "@/lib/invoice-pdf";
import { attachmentContentDisposition } from "@/lib/rfq-attachments";
import { getRfqViewer } from "@/lib/rfq-access";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ invoiceId: string }> };

function invoicePdfFilename(invoiceNumber: string): string {
  const safeInvoiceNumber = invoiceNumber
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "invoice";
  return `${safeInvoiceNumber}.pdf`;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (viewer.kind === "unlinked-vendor") {
    return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
  }

  const { invoiceId } = await params;
  if (!z.string().uuid().safeParse(invoiceId).success) {
    return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
  }

  try {
    const invoice = await getInvoiceDocument(
      invoiceId,
      viewer.kind === "vendor" ? viewer.vendorId : undefined,
    );
    if (!invoice) {
      return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
    }

    const pdf = await renderInvoicePdf(invoice);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": attachmentContentDisposition(
          invoicePdfFilename(invoice.invoiceNumber),
        ),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof InvoiceIssuerConfigurationError) {
      console.error("Invoice issuer configuration error:", error.message);
      return NextResponse.json(
        { message: "Invoice PDF configuration is invalid." },
        { status: 500 },
      );
    }

    console.error("Invoice PDF download error:", error);
    return NextResponse.json({ message: "Unable to generate invoice PDF." }, { status: 500 });
  }
}
