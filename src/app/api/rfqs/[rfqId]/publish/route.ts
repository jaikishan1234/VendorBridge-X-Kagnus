import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { rfqLineItems, rfqVendorAssignments, rfqs } from "@/db/schema";
import { requireRole } from "@/lib/authorization";

class RfqNotFoundError extends Error {}
class RfqNotPublishableError extends Error {}

function hasRequiredRfqDetails(rfq: {
  title: string;
  category: string;
  currency: string;
  deadline: Date;
}) {
  return (
    rfq.title.trim().length > 0 &&
    rfq.category.trim().length > 0 &&
    /^[A-Za-z]{3}$/.test(rfq.currency) &&
    rfq.deadline.getTime() > Date.now()
  );
}

async function publishRfq(rfqId: string) {
  return db.transaction(async (tx) => {
    // Lock the RFQ so that a concurrent publish or lifecycle update cannot
    // validate an outdated status and silently open the same draft twice.
    const [rfq] = await tx
      .select({
        id: rfqs.id,
        title: rfqs.title,
        category: rfqs.category,
        currency: rfqs.currency,
        deadline: rfqs.deadline,
        status: rfqs.status,
      })
      .from(rfqs)
      .where(eq(rfqs.id, rfqId))
      .for("update")
      .limit(1);

    if (!rfq) throw new RfqNotFoundError();

    if (rfq.status !== "DRAFT" || !hasRequiredRfqDetails(rfq)) {
      throw new RfqNotPublishableError();
    }

    const [lineItem] = await tx
      .select({ id: rfqLineItems.id })
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, rfq.id))
      .limit(1);
    const [assignment] = await tx
      .select({ id: rfqVendorAssignments.id })
      .from(rfqVendorAssignments)
      .where(eq(rfqVendorAssignments.rfqId, rfq.id))
      .limit(1);

    if (!lineItem || !assignment) throw new RfqNotPublishableError();

    const [published] = await tx
      .update(rfqs)
      .set({ status: "OPEN", updatedAt: new Date() })
      .where(and(eq(rfqs.id, rfq.id), eq(rfqs.status, "DRAFT")))
      .returning({ id: rfqs.id, status: rfqs.status });

    if (!published) throw new RfqNotPublishableError();

    return published;
  });
}

type RouteContext = { params: Promise<{ rfqId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
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
    const rfq = await publishRfq(rfqId);
    return NextResponse.json({ message: "RFQ published.", rfq });
  } catch (error) {
    if (error instanceof RfqNotFoundError) {
      return NextResponse.json({ message: "RFQ not found." }, { status: 404 });
    }
    if (error instanceof RfqNotPublishableError) {
      return NextResponse.json(
        {
          message:
            "This RFQ cannot be published. It must be a draft with line items, assigned vendors, and a future deadline.",
        },
        { status: 409 },
      );
    }

    console.error("Publish RFQ error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
