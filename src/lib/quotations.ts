import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quotationLineItems, quotations, rfqLineItems, rfqs } from "@/db/schema";
import type { VendorQuotationAccess } from "@/lib/quotation-access";
import type {
  QuotationDraftInput,
  QuotationSubmissionInput,
} from "@/lib/validations/quotation";

type AuthorizedVendorRfq = Extract<VendorQuotationAccess, { kind: "vendor" }>;

export class QuotationConflictError extends Error {}
export class InvalidQuotationLineItemsError extends Error {}
export class IncompleteQuotationError extends Error {}
export class RfqNotOpenForQuotingError extends Error {}
export class QuotationDeadlinePassedError extends Error {}

export async function getCurrentVendorQuotation(access: AuthorizedVendorRfq) {
  const [quotation] = await db
    .select({
      id: quotations.id,
      status: quotations.status,
      submittedAt: quotations.submittedAt,
      createdAt: quotations.createdAt,
      updatedAt: quotations.updatedAt,
    })
    .from(quotations)
    .where(
      and(
        eq(quotations.rfqId, access.rfq.id),
        eq(quotations.vendorId, access.vendorId),
      ),
    )
    .limit(1);

  if (!quotation) return null;

  const lineItems = await db
    .select({
      rfqLineItemId: quotationLineItems.rfqLineItemId,
      unitPrice: quotationLineItems.unitPrice,
    })
    .from(quotationLineItems)
    .where(eq(quotationLineItems.quotationId, quotation.id))
    .orderBy(asc(quotationLineItems.rfqLineItemId));

  return {
    ...quotation,
    rfqId: access.rfq.id,
    currency: access.rfq.currency,
    lineItems,
  };
}

function validateLineItems(
  rfqLineItemIds: Set<string>,
  lineItems: QuotationDraftInput["lineItems"],
  requireAll: boolean,
) {
  const quotedLineItemIds = new Set(lineItems.map((lineItem) => lineItem.rfqLineItemId));

  if (
    quotedLineItemIds.size !== lineItems.length ||
    [...quotedLineItemIds].some((lineItemId) => !rfqLineItemIds.has(lineItemId))
  ) {
    throw new InvalidQuotationLineItemsError();
  }

  if (
    requireAll &&
    (rfqLineItemIds.size !== quotedLineItemIds.size ||
      [...rfqLineItemIds].some((lineItemId) => !quotedLineItemIds.has(lineItemId)))
  ) {
    throw new IncompleteQuotationError();
  }
}

async function persistDraft(
  access: AuthorizedVendorRfq,
  input: QuotationDraftInput,
  submit: boolean,
) {
  return db.transaction(async (tx) => {
    // This lock makes the RFQ state and deadline check authoritative for the
    // writes below. A concurrent RFQ close/update must complete before the
    // quotation can continue, or wait until this transaction commits.
    const [lockedRfq] = await tx
      .select({ status: rfqs.status, deadline: rfqs.deadline })
      .from(rfqs)
      .where(eq(rfqs.id, access.rfq.id))
      .for("update")
      .limit(1);

    if (!lockedRfq || lockedRfq.status !== "OPEN") {
      throw new RfqNotOpenForQuotingError();
    }

    if (submit && lockedRfq.deadline.getTime() <= Date.now()) {
      throw new QuotationDeadlinePassedError();
    }

    const rfqLineItemsForQuote = await tx
      .select({ id: rfqLineItems.id })
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, access.rfq.id));
    validateLineItems(
      new Set(rfqLineItemsForQuote.map((lineItem) => lineItem.id)),
      input.lineItems,
      submit,
    );

    let [quotation] = await tx
      .select({ id: quotations.id, status: quotations.status })
      .from(quotations)
      .where(
        and(
          eq(quotations.rfqId, access.rfq.id),
          eq(quotations.vendorId, access.vendorId),
        ),
      )
      .limit(1);

    if (quotation?.status === "SUBMITTED") {
      throw new QuotationConflictError("A submitted quotation cannot be changed.");
    }

    if (!quotation) {
      const [created] = await tx
        .insert(quotations)
        .values({ rfqId: access.rfq.id, vendorId: access.vendorId })
        .onConflictDoNothing()
        .returning({ id: quotations.id, status: quotations.status });

      if (created) {
        quotation = created;
      } else {
        [quotation] = await tx
          .select({ id: quotations.id, status: quotations.status })
          .from(quotations)
          .where(
            and(
              eq(quotations.rfqId, access.rfq.id),
              eq(quotations.vendorId, access.vendorId),
            ),
          )
          .limit(1);

        if (!quotation || quotation.status === "SUBMITTED") {
          throw new QuotationConflictError("The quotation was submitted concurrently.");
        }
      }
    }

    const [lockedQuotation] = await tx
      .update(quotations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(quotations.id, quotation.id),
          eq(quotations.status, "DRAFT"),
        ),
      )
      .returning({ id: quotations.id });

    if (!lockedQuotation) {
      throw new QuotationConflictError("The quotation was submitted concurrently.");
    }

    await tx
      .delete(quotationLineItems)
      .where(eq(quotationLineItems.quotationId, quotation.id));
    await tx.insert(quotationLineItems).values(
      input.lineItems.map((lineItem) => ({
        quotationId: quotation.id,
        rfqId: access.rfq.id,
        rfqLineItemId: lineItem.rfqLineItemId,
        unitPrice: lineItem.unitPrice,
      })),
    );

    if (!submit) return { id: quotation.id, status: "DRAFT" as const };

    const [submitted] = await tx
      .update(quotations)
      .set({ status: "SUBMITTED", submittedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(quotations.id, quotation.id), eq(quotations.status, "DRAFT")))
      .returning({ id: quotations.id });

    if (!submitted) {
      throw new QuotationConflictError("The quotation was submitted concurrently.");
    }

    return { id: submitted.id, status: "SUBMITTED" as const };
  });
}

export async function saveVendorQuotationDraft(
  access: AuthorizedVendorRfq,
  input: QuotationDraftInput,
) {
  return persistDraft(access, input, false);
}

export async function submitVendorQuotation(
  access: AuthorizedVendorRfq,
  input: QuotationSubmissionInput,
) {
  return persistDraft(access, input, true);
}
