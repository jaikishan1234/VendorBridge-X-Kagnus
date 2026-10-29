import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { rfqVendorAssignments, rfqs } from "@/db/schema";
import { getRfqViewer } from "@/lib/rfq-access";

export type VendorQuotationAccess =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "unlinked-vendor" }
  | { kind: "not-found" }
  | {
      kind: "vendor";
      vendorId: string;
      rfq: {
        id: string;
        status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
        deadline: Date;
        currency: string;
      };
    };

/**
 * Resolves quotation access from the signed-in user's membership and a
 * matching RFQ assignment. Neither a vendor id nor a user id enters this
 * function from the request body.
 */
export async function getVendorQuotationAccess(
  rfqId: string,
): Promise<VendorQuotationAccess> {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") return viewer;
  if (viewer.kind === "forbidden" || viewer.kind === "procurement") {
    return { kind: "forbidden" };
  }
  if (viewer.kind === "unlinked-vendor") return viewer;

  const [rfq] = await db
    .select({
      id: rfqs.id,
      status: rfqs.status,
      deadline: rfqs.deadline,
      currency: rfqs.currency,
    })
    .from(rfqs)
    .innerJoin(rfqVendorAssignments, eq(rfqVendorAssignments.rfqId, rfqs.id))
    .where(
      and(
        eq(rfqs.id, rfqId),
        eq(rfqVendorAssignments.vendorId, viewer.vendorId),
        eq(rfqs.status, "OPEN"),
      ),
    )
    .limit(1);

  if (!rfq) return { kind: "not-found" };

  return { kind: "vendor", vendorId: viewer.vendorId, rfq };
}
