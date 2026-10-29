import { NextResponse } from "next/server";
import { z } from "zod";
import { getVendorQuotationAccess } from "@/lib/quotation-access";
import {
  IncompleteQuotationError,
  InvalidQuotationLineItemsError,
  QuotationConflictError,
  QuotationDeadlinePassedError,
  RfqNotOpenForQuotingError,
  submitVendorQuotation,
} from "@/lib/quotations";
import { quotationSubmissionSchema } from "@/lib/validations/quotation";

type RouteContext = { params: Promise<{ rfqId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { rfqId } = await params;
  if (!z.string().uuid().safeParse(rfqId).success) {
    return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
  }

  const access = await getVendorQuotationAccess(rfqId);
  if (access.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (access.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (access.kind !== "vendor") {
    return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
  }

  const result = quotationSubmissionSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { message: "Review the quotation details and try again.", fieldErrors: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const quotation = await submitVendorQuotation(access, result.data);
    return NextResponse.json({ message: "Quotation submitted.", quotation });
  } catch (error) {
    if (error instanceof InvalidQuotationLineItemsError) {
      return NextResponse.json({ message: "One or more quoted line items do not belong to this RFQ." }, { status: 400 });
    }
    if (error instanceof IncompleteQuotationError) {
      return NextResponse.json({ message: "Quote every RFQ line item before submitting." }, { status: 400 });
    }
    if (error instanceof QuotationDeadlinePassedError) {
      return NextResponse.json({ message: "The quotation deadline has passed." }, { status: 409 });
    }
    if (error instanceof RfqNotOpenForQuotingError) {
      return NextResponse.json({ message: "This RFQ is not open for quotations." }, { status: 409 });
    }
    if (error instanceof QuotationConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error("Submit quotation error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}
