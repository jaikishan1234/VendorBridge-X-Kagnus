import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ActiveRfqApprovalError,
  ApprovalAlreadyExistsError,
  createApprovalRequest,
  QuotationNotFoundError,
  QuotationNotSubmittedError,
} from "@/lib/approvals";
import { requireRole } from "@/lib/authorization";

type RouteContext = {
  params: Promise<{ rfqId: string; quotationId: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { rfqId, quotationId } = await params;
  if (
    !z.string().uuid().safeParse(rfqId).success ||
    !z.string().uuid().safeParse(quotationId).success
  ) {
    return NextResponse.json({ message: "Quotation not found." }, { status: 404 });
  }

  try {
    const approval = await createApprovalRequest(
      rfqId,
      quotationId,
      authorization.user.id,
    );
    return NextResponse.json(
      { message: "Quotation sent for manager approval.", approval },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof QuotationNotFoundError) {
      return NextResponse.json({ message: "Quotation not found." }, { status: 404 });
    }
    if (error instanceof QuotationNotSubmittedError) {
      return NextResponse.json(
        { message: "Only submitted quotations can be selected for approval." },
        { status: 409 },
      );
    }
    if (error instanceof ApprovalAlreadyExistsError) {
      return NextResponse.json(
        { message: "This quotation has already been selected for approval." },
        { status: 409 },
      );
    }
    if (error instanceof ActiveRfqApprovalError) {
      return NextResponse.json(
        { message: "This RFQ already has an active quotation selection." },
        { status: 409 },
      );
    }

    console.error("Create approval request error:", error);
    return NextResponse.json(
      { message: "Unable to select this quotation for approval." },
      { status: 500 },
    );
  }
}
