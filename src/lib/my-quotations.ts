import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { quotationLineItems, quotations, rfqLineItems, rfqs } from "@/db/schema";
import { calculateComparableTotal } from "@/lib/quotation-comparison";

export type MyQuotation = {
  id: string;
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  currency: string;
  status: "DRAFT" | "SUBMITTED";
  deliveryTimeline: string | null;
  submittedAt: Date | null;
  updatedAt: Date;
  total: string | null;
};

export async function getMyQuotations(vendorId: string): Promise<MyQuotation[]> {
  const quotationHeaders = await db
    .select({
      id: quotations.id,
      rfqId: quotations.rfqId,
      status: quotations.status,
      deliveryTimeline: quotations.deliveryTimeline,
      submittedAt: quotations.submittedAt,
      updatedAt: quotations.updatedAt,
      rfqNumber: rfqs.rfqNumber,
      rfqTitle: rfqs.title,
      currency: rfqs.currency,
    })
    .from(quotations)
    .innerJoin(rfqs, eq(rfqs.id, quotations.rfqId))
    .where(eq(quotations.vendorId, vendorId))
    .orderBy(desc(quotations.updatedAt));

  if (quotationHeaders.length === 0) return [];

  const quotationIds = quotationHeaders.map((quotation) => quotation.id);
  const rfqIds = [...new Set(quotationHeaders.map((quotation) => quotation.rfqId))];
  const quotedLineItems = await db
    .select({
      quotationId: quotationLineItems.quotationId,
      rfqId: quotationLineItems.rfqId,
      rfqLineItemId: quotationLineItems.rfqLineItemId,
      unitPrice: quotationLineItems.unitPrice,
      quantity: rfqLineItems.quantity,
    })
    .from(quotationLineItems)
    .innerJoin(
      rfqLineItems,
      eq(rfqLineItems.id, quotationLineItems.rfqLineItemId),
    )
    .where(inArray(quotationLineItems.quotationId, quotationIds));
  const requestedLineItems = await db
    .select({ id: rfqLineItems.id, rfqId: rfqLineItems.rfqId })
    .from(rfqLineItems)
    .where(inArray(rfqLineItems.rfqId, rfqIds));

  const requiredLineItemIdsByRfq = new Map<string, Set<string>>();
  requestedLineItems.forEach((lineItem) => {
    const requiredLineItemIds = requiredLineItemIdsByRfq.get(lineItem.rfqId) ?? new Set<string>();
    requiredLineItemIds.add(lineItem.id);
    requiredLineItemIdsByRfq.set(lineItem.rfqId, requiredLineItemIds);
  });
  const quotedLineItemsByQuotation = new Map<string, typeof quotedLineItems>();
  quotedLineItems.forEach((lineItem) => {
    const quotationLineItemsForQuote = quotedLineItemsByQuotation.get(lineItem.quotationId) ?? [];
    quotationLineItemsForQuote.push(lineItem);
    quotedLineItemsByQuotation.set(lineItem.quotationId, quotationLineItemsForQuote);
  });

  return quotationHeaders.map((quotation) => {
    const quoteLineItems = quotedLineItemsByQuotation.get(quotation.id) ?? [];
    const requiredLineItemIds = requiredLineItemIdsByRfq.get(quotation.rfqId) ?? new Set<string>();
    const quotedLineItemIds = new Set(quoteLineItems.map((lineItem) => lineItem.rfqLineItemId));
    const isComparable =
      requiredLineItemIds.size > 0 &&
      quotedLineItemIds.size === requiredLineItemIds.size &&
      [...requiredLineItemIds].every((lineItemId) => quotedLineItemIds.has(lineItemId));

    return {
      ...quotation,
      total: isComparable
        ? calculateComparableTotal(quoteLineItems).total
        : null,
    };
  });
}
