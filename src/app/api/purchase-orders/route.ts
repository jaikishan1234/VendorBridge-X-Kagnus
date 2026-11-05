import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authorization";
import {
  generatePurchaseOrder,
  getApprovedPurchaseOrderCandidates,
  getPurchaseOrders,
  PurchaseOrderAlreadyExistsError,
  PurchaseOrderApprovalNotApprovedError,
  PurchaseOrderApprovalNotFoundError,
  PurchaseOrderSourceInvalidError,
} from "@/lib/purchase-orders";
import { getRfqViewer } from "@/lib/rfq-access";

const generatePurchaseOrderSchema = z
  .object({
    approvalRequestId: z.string().uuid("Select a valid approval request."),
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

  const result = generatePurchaseOrderSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      {
        message: "Select an approval request to generate a purchase order.",
        fieldErrors: result.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const purchaseOrder = await generatePurchaseOrder(
      result.data.approvalRequestId,
      authorization.user.id,
    );
    return NextResponse.json(
      { message: "Purchase order generated.", purchaseOrder },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PurchaseOrderApprovalNotFoundError) {
      return NextResponse.json(
        { message: "Approval request not found." },
        { status: 404 },
      );
    }
    if (
      error instanceof PurchaseOrderApprovalNotApprovedError ||
      error instanceof PurchaseOrderAlreadyExistsError
    ) {
      return NextResponse.json(
        {
          message:
            error instanceof PurchaseOrderApprovalNotApprovedError
              ? "Only approved quotations can generate a purchase order."
              : "A purchase order has already been generated for this quotation.",
        },
        { status: 409 },
      );
    }
    if (error instanceof PurchaseOrderSourceInvalidError) {
      return NextResponse.json(
        { message: "The approved quotation cannot be used to generate a purchase order." },
        { status: 409 },
      );
    }

    console.error("Generate purchase order error:", error);
    return NextResponse.json(
      { message: "Unable to generate a purchase order." },
      { status: 500 },
    );
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
    if (viewer.kind === "procurement") {
      const [purchaseOrders, approvedQuotations] = await Promise.all([
        getPurchaseOrders(),
        getApprovedPurchaseOrderCandidates(),
      ]);
      return NextResponse.json({ purchaseOrders, approvedQuotations });
    }

    const purchaseOrders = await getPurchaseOrders(viewer.vendorId);
    return NextResponse.json({ purchaseOrders, approvedQuotations: [] });
  } catch (error) {
    console.error("Get purchase orders error:", error);
    return NextResponse.json(
      { message: "Unable to load purchase orders." },
      { status: 500 },
    );
  }
}
