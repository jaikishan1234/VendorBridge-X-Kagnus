import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/authorization";
import { getQuotationComparison } from "@/lib/quotation-comparison";

type RouteContext = { params: Promise<{ rfqId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { rfqId } = await params;
  if (!z.string().uuid().safeParse(rfqId).success) {
    return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
  }

  try {
    const comparison = await getQuotationComparison(rfqId);
    if (!comparison) {
      return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
    }

    return NextResponse.json({ comparison });
  } catch (error) {
    console.error("Get quotation comparison error:", error);
    return NextResponse.json(
      { message: "Unable to load quotation comparison." },
      { status: 500 },
    );
  }
}
