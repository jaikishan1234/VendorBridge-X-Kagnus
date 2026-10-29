import { NextResponse } from "next/server";
import { z } from "zod";
import { getVendorQuotationAccess } from "@/lib/quotation-access";
import {
  getCurrentVendorQuotation,
  InvalidQuotationLineItemsError,
  QuotationConflictError,
  RfqNotOpenForQuotingError,
  saveVendorQuotationDraft,
} from "@/lib/quotations";
import { quotationDraftSchema } from "@/lib/validations/quotation";

type RouteContext = { params: Promise<{ rfqId: string }> };

function accessErrorResponse(access: Awaited<ReturnType<typeof getVendorQuotationAccess>>) {
  if (access.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (access.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
}

async function getAccess(params: RouteContext["params"]) {
  const { rfqId } = await params;
  if (!z.string().uuid().safeParse(rfqId).success) return null;
  return getVendorQuotationAccess(rfqId);
}

export async function GET(_request: Request, { params }: RouteContext) {
  const access = await getAccess(params);
  if (!access || access.kind !== "vendor") {
    return accessErrorResponse(access ?? { kind: "not-found" });
  }

  try {
    const quotation = await getCurrentVendorQuotation(access);
    return NextResponse.json({ quotation });
  } catch (error) {
    console.error("Get vendor quotation error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}

async function saveDraft(request: Request, params: RouteContext["params"]) {
  const access = await getAccess(params);
  if (!access || access.kind !== "vendor") {
    return accessErrorResponse(access ?? { kind: "not-found" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON request body" }, { status: 400 });
  }

  const result = quotationDraftSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { message: "Review the quotation details and try again.", fieldErrors: result.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  try {
    const quotation = await saveVendorQuotationDraft(access, result.data);
    return NextResponse.json({ message: "Quotation draft saved.", quotation });
  } catch (error) {
    if (error instanceof InvalidQuotationLineItemsError) {
      return NextResponse.json({ message: "One or more quoted line items do not belong to this RFQ." }, { status: 400 });
    }
    if (error instanceof RfqNotOpenForQuotingError) {
      return NextResponse.json({ message: "This RFQ is not open for quotations." }, { status: 409 });
    }
    if (error instanceof QuotationConflictError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    console.error("Save quotation draft error:", error);
    return NextResponse.json({ message: "An unexpected error occurred" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  return saveDraft(request, params);
}

export async function PUT(request: Request, { params }: RouteContext) {
  return saveDraft(request, params);
}
