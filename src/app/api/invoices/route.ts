import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authorization";
import {
  generateInvoice,
  getInvoices,
  InvoiceAlreadyExistsError,
  InvoiceGstRateConfigurationError,
  InvoicePurchaseOrderNotFoundError,
  InvoicePurchaseOrderNotGeneratedError,
  InvoiceSourceInvalidError,
} from "@/lib/invoices";
import { getRfqViewer } from "@/lib/rfq-access";

const generateInvoiceSchema = z
  .object({
    purchaseOrderId: z.string().uuid("Select a valid purchase order."),
  })
  .strict();

export async function POST(request: Request) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
  }

  const result = generateInvoiceSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        message: "Select a purchase order to generate an invoice.",
        fieldErrors: result.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const invoice = await generateInvoice(
      result.data.purchaseOrderId,
      authorization.user.id,
    );
    return NextResponse.json({ message: "Invoice generated.", invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof InvoicePurchaseOrderNotFoundError) {
      return NextResponse.json({ message: "Purchase order not found." }, { status: 404 });
    }
    if (
      error instanceof InvoicePurchaseOrderNotGeneratedError ||
      error instanceof InvoiceAlreadyExistsError ||
      error instanceof InvoiceSourceInvalidError
    ) {
      const message =
        error instanceof InvoicePurchaseOrderNotGeneratedError
          ? "Only generated purchase orders can create an invoice."
          : error instanceof InvoiceAlreadyExistsError
            ? "An invoice has already been generated for this purchase order."
            : "The purchase order cannot be used to generate an invoice.";
      return NextResponse.json({ message }, { status: 409 });
    }
    if (error instanceof InvoiceGstRateConfigurationError) {
      console.error("Invoice GST configuration error:", error);
      return NextResponse.json(
        { message: "Invoice GST configuration is invalid." },
        { status: 500 },
      );
    }

    console.error("Generate invoice error:", error);
    return NextResponse.json({ message: "Unable to generate an invoice." }, { status: 500 });
  }
}

export async function GET() {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (viewer.kind === "unlinked-vendor") {
    return NextResponse.json({ message: "Vendor profile not found." }, { status: 404 });
  }

  try {
    const invoices = await getInvoices(
      viewer.kind === "vendor" ? viewer.vendorId : undefined,
    );
    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("Get invoices error:", error);
    return NextResponse.json({ message: "Unable to load invoices." }, { status: 500 });
  }
}
