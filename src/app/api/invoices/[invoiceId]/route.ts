import { NextResponse } from "next/server";
import { z } from "zod";
import { getInvoice } from "@/lib/invoices";
import { getRfqViewer } from "@/lib/rfq-access";

type RouteContext = { params: Promise<{ invoiceId: string }> };

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
    const invoice = await getInvoice(
      invoiceId,
      viewer.kind === "vendor" ? viewer.vendorId : undefined,
    );
    if (!invoice) {
      return NextResponse.json({ message: "Invoice not found." }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    console.error("Get invoice error:", error);
    return NextResponse.json({ message: "Unable to load invoice." }, { status: 500 });
  }
}
