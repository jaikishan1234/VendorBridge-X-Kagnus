import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import {
  approvalRequests,
  purchaseOrderLineItems,
  purchaseOrders,
  quotationLineItems,
  quotations,
  rfqLineItems,
  rfqs,
  vendors,
} from "@/db/schema";

const maximumPurchaseOrderNumberAttempts = 3;

export class PurchaseOrderApprovalNotFoundError extends Error {}
export class PurchaseOrderApprovalNotApprovedError extends Error {}
export class PurchaseOrderSourceInvalidError extends Error {}
export class PurchaseOrderAlreadyExistsError extends Error {}

type PurchaseOrderSourceLineItem = {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

function decimalToScaledInteger(value: string, scale: number): bigint {
  const [wholePart, fractionPart = ""] = value.split(".");
  const whole = wholePart || "0";
  const fraction = fractionPart.padEnd(scale, "0").slice(0, scale);
  return BigInt(`${whole}${fraction}`);
}

function formatCents(cents: bigint): string {
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}

function calculatePurchaseOrderTotals(lineItems: PurchaseOrderSourceLineItem[]) {
  const lineItemsWithTotals = lineItems.map((lineItem) => {
    const totalAtFiveDecimalPlaces =
      decimalToScaledInteger(lineItem.quantity, 3) *
      decimalToScaledInteger(lineItem.unitPrice, 2);
    const lineTotalInCents =
      (totalAtFiveDecimalPlaces + BigInt(500)) / BigInt(1_000);

    return {
      ...lineItem,
      lineTotal: formatCents(lineTotalInCents),
      lineTotalInCents,
    };
  });

  const totalInCents = lineItemsWithTotals.reduce(
    (total, lineItem) => total + lineItem.lineTotalInCents,
    BigInt(0),
  );

  return {
    lineItems: lineItemsWithTotals,
    totalAmount: formatCents(totalInCents),
  };
}

function generatePurchaseOrderNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

  return `PO-${date}-${suffix}`;
}

function hasConstraint(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === constraint
  );
}

function isPurchaseOrderNumberConflict(error: unknown): boolean {
  return hasConstraint(error, "purchase_orders_po_number_unique");
}

function isDuplicatePurchaseOrderConflict(error: unknown): boolean {
  return (
    hasConstraint(error, "purchase_orders_approval_request_id_unique") ||
    hasConstraint(error, "purchase_orders_quotation_id_unique")
  );
}

async function createPurchaseOrder(
  approvalRequestId: string,
  generatedByUserId: string,
) {
  return db.transaction(async (tx) => {
    const [approval] = await tx
      .select({
        id: approvalRequests.id,
        status: approvalRequests.status,
        quotationId: approvalRequests.quotationId,
        rfqId: approvalRequests.rfqId,
        vendorId: approvalRequests.vendorId,
      })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalRequestId))
      .for("update")
      .limit(1);

    if (!approval) throw new PurchaseOrderApprovalNotFoundError();
    if (approval.status !== "APPROVED") {
      throw new PurchaseOrderApprovalNotApprovedError();
    }

    const [existingPurchaseOrder] = await tx
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        or(
          eq(purchaseOrders.approvalRequestId, approval.id),
          eq(purchaseOrders.quotationId, approval.quotationId),
        ),
      )
      .limit(1);

    if (existingPurchaseOrder) throw new PurchaseOrderAlreadyExistsError();

    const [source] = await tx
      .select({
        quotationId: quotations.id,
        rfqId: rfqs.id,
        vendorId: vendors.id,
        currency: rfqs.currency,
      })
      .from(quotations)
      .innerJoin(
        rfqs,
        eq(quotations.rfqId, rfqs.id),
      )
      .innerJoin(
        vendors,
        eq(quotations.vendorId, vendors.id),
      )
      .where(
        and(
          eq(quotations.id, approval.quotationId),
          eq(quotations.rfqId, approval.rfqId),
          eq(quotations.vendorId, approval.vendorId),
        ),
      )
      .limit(1);

    if (!source) throw new PurchaseOrderSourceInvalidError();

    const requiredLineItems = await tx
      .select({
        id: rfqLineItems.id,
        lineNumber: rfqLineItems.lineNumber,
        description: rfqLineItems.description,
        quantity: rfqLineItems.quantity,
        unit: rfqLineItems.unit,
      })
      .from(rfqLineItems)
      .where(eq(rfqLineItems.rfqId, source.rfqId))
      .orderBy(asc(rfqLineItems.lineNumber));

    const quotedLineItems = await tx
      .select({
        rfqId: quotationLineItems.rfqId,
        rfqLineItemId: quotationLineItems.rfqLineItemId,
        unitPrice: quotationLineItems.unitPrice,
      })
      .from(quotationLineItems)
      .where(eq(quotationLineItems.quotationId, source.quotationId));

    const requiredLineItemsById = new Map(
      requiredLineItems.map((lineItem) => [lineItem.id, lineItem]),
    );
    const unitPricesByRfqLineItemId = new Map<string, string>();

    for (const quotedLineItem of quotedLineItems) {
      if (
        quotedLineItem.rfqId !== source.rfqId ||
        !requiredLineItemsById.has(quotedLineItem.rfqLineItemId) ||
        unitPricesByRfqLineItemId.has(quotedLineItem.rfqLineItemId)
      ) {
        throw new PurchaseOrderSourceInvalidError();
      }

      unitPricesByRfqLineItemId.set(
        quotedLineItem.rfqLineItemId,
        quotedLineItem.unitPrice,
      );
    }

    if (
      requiredLineItems.length === 0 ||
      unitPricesByRfqLineItemId.size !== requiredLineItems.length
    ) {
      throw new PurchaseOrderSourceInvalidError();
    }

    const sourceLineItems = requiredLineItems.map((lineItem) => {
      const unitPrice = unitPricesByRfqLineItemId.get(lineItem.id);
      if (!unitPrice) throw new PurchaseOrderSourceInvalidError();

      return {
        ...lineItem,
        unitPrice,
      };
    });
    const totals = calculatePurchaseOrderTotals(sourceLineItems);
    const generatedAt = new Date();

    const [purchaseOrder] = await tx
      .insert(purchaseOrders)
      .values({
        poNumber: generatePurchaseOrderNumber(generatedAt),
        approvalRequestId: approval.id,
        quotationId: source.quotationId,
        rfqId: source.rfqId,
        vendorId: source.vendorId,
        generatedByUserId,
        currency: source.currency,
        totalAmount: totals.totalAmount,
        generatedAt,
        createdAt: generatedAt,
        updatedAt: generatedAt,
      })
      .returning({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        approvalRequestId: purchaseOrders.approvalRequestId,
        quotationId: purchaseOrders.quotationId,
        rfqId: purchaseOrders.rfqId,
        vendorId: purchaseOrders.vendorId,
        generatedByUserId: purchaseOrders.generatedByUserId,
        status: purchaseOrders.status,
        currency: purchaseOrders.currency,
        totalAmount: purchaseOrders.totalAmount,
        generatedAt: purchaseOrders.generatedAt,
        createdAt: purchaseOrders.createdAt,
        updatedAt: purchaseOrders.updatedAt,
      });

    const lineItems = await tx
      .insert(purchaseOrderLineItems)
      .values(
        totals.lineItems.map((lineItem) => ({
          purchaseOrderId: purchaseOrder.id,
          rfqId: source.rfqId,
          rfqLineItemId: lineItem.id,
          lineNumber: lineItem.lineNumber,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unit: lineItem.unit,
          unitPrice: lineItem.unitPrice,
          lineTotal: lineItem.lineTotal,
          createdAt: generatedAt,
          updatedAt: generatedAt,
        })),
      )
      .returning({
        id: purchaseOrderLineItems.id,
        purchaseOrderId: purchaseOrderLineItems.purchaseOrderId,
        rfqId: purchaseOrderLineItems.rfqId,
        rfqLineItemId: purchaseOrderLineItems.rfqLineItemId,
        lineNumber: purchaseOrderLineItems.lineNumber,
        description: purchaseOrderLineItems.description,
        quantity: purchaseOrderLineItems.quantity,
        unit: purchaseOrderLineItems.unit,
        unitPrice: purchaseOrderLineItems.unitPrice,
        lineTotal: purchaseOrderLineItems.lineTotal,
        createdAt: purchaseOrderLineItems.createdAt,
        updatedAt: purchaseOrderLineItems.updatedAt,
      });

    return { ...purchaseOrder, lineItems };
  });
}

export async function generatePurchaseOrder(
  approvalRequestId: string,
  generatedByUserId: string,
) {
  for (
    let attempt = 0;
    attempt < maximumPurchaseOrderNumberAttempts;
    attempt += 1
  ) {
    try {
      return await createPurchaseOrder(approvalRequestId, generatedByUserId);
    } catch (error) {
      if (isDuplicatePurchaseOrderConflict(error)) {
        throw new PurchaseOrderAlreadyExistsError();
      }

      if (
        isPurchaseOrderNumberConflict(error) &&
        attempt < maximumPurchaseOrderNumberAttempts - 1
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to generate a unique purchase order number.");
}

export async function getPurchaseOrders(vendorId?: string) {
  const selection = {
    id: purchaseOrders.id,
    poNumber: purchaseOrders.poNumber,
    approvalRequestId: purchaseOrders.approvalRequestId,
    quotationId: purchaseOrders.quotationId,
    rfqId: purchaseOrders.rfqId,
    vendorId: purchaseOrders.vendorId,
    generatedByUserId: purchaseOrders.generatedByUserId,
    status: purchaseOrders.status,
    currency: purchaseOrders.currency,
    totalAmount: purchaseOrders.totalAmount,
    generatedAt: purchaseOrders.generatedAt,
    createdAt: purchaseOrders.createdAt,
    updatedAt: purchaseOrders.updatedAt,
    rfqNumber: rfqs.rfqNumber,
    rfqTitle: rfqs.title,
    vendorName: vendors.vendorName,
  };

  const query = db
    .select(selection)
    .from(purchaseOrders)
    .innerJoin(rfqs, eq(purchaseOrders.rfqId, rfqs.id))
    .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id));

  if (vendorId) {
    return query
      .where(eq(purchaseOrders.vendorId, vendorId))
      .orderBy(desc(purchaseOrders.generatedAt));
  }

  return query.orderBy(desc(purchaseOrders.generatedAt));
}

export async function getApprovedPurchaseOrderCandidates() {
  return db
    .select({
      approvalRequestId: approvalRequests.id,
      quotationId: quotations.id,
      rfqId: rfqs.id,
      rfqNumber: rfqs.rfqNumber,
      rfqTitle: rfqs.title,
      vendorId: vendors.id,
      vendorName: vendors.vendorName,
      currency: rfqs.currency,
      approvedAt: approvalRequests.decidedAt,
    })
    .from(approvalRequests)
    .innerJoin(quotations, eq(approvalRequests.quotationId, quotations.id))
    .innerJoin(rfqs, eq(approvalRequests.rfqId, rfqs.id))
    .innerJoin(vendors, eq(approvalRequests.vendorId, vendors.id))
    .leftJoin(
      purchaseOrders,
      eq(purchaseOrders.approvalRequestId, approvalRequests.id),
    )
    .where(
      and(
        eq(approvalRequests.status, "APPROVED"),
        isNull(purchaseOrders.id),
      ),
    )
    .orderBy(desc(approvalRequests.decidedAt));
}

export async function getPurchaseOrder(
  purchaseOrderId: string,
  vendorId?: string,
) {
  const [purchaseOrder] = await db
    .select({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
      approvalRequestId: purchaseOrders.approvalRequestId,
      quotationId: purchaseOrders.quotationId,
      rfqId: purchaseOrders.rfqId,
      vendorId: purchaseOrders.vendorId,
      generatedByUserId: purchaseOrders.generatedByUserId,
      status: purchaseOrders.status,
      currency: purchaseOrders.currency,
      totalAmount: purchaseOrders.totalAmount,
      generatedAt: purchaseOrders.generatedAt,
      createdAt: purchaseOrders.createdAt,
      updatedAt: purchaseOrders.updatedAt,
      rfqNumber: rfqs.rfqNumber,
      rfqTitle: rfqs.title,
      vendorName: vendors.vendorName,
    })
    .from(purchaseOrders)
    .innerJoin(rfqs, eq(purchaseOrders.rfqId, rfqs.id))
    .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .where(
      vendorId
        ? and(
            eq(purchaseOrders.id, purchaseOrderId),
            eq(purchaseOrders.vendorId, vendorId),
          )
        : eq(purchaseOrders.id, purchaseOrderId),
    )
    .limit(1);

  if (!purchaseOrder) return null;

  const lineItems = await db
    .select({
      id: purchaseOrderLineItems.id,
      purchaseOrderId: purchaseOrderLineItems.purchaseOrderId,
      rfqId: purchaseOrderLineItems.rfqId,
      rfqLineItemId: purchaseOrderLineItems.rfqLineItemId,
      lineNumber: purchaseOrderLineItems.lineNumber,
      description: purchaseOrderLineItems.description,
      quantity: purchaseOrderLineItems.quantity,
      unit: purchaseOrderLineItems.unit,
      unitPrice: purchaseOrderLineItems.unitPrice,
      lineTotal: purchaseOrderLineItems.lineTotal,
      createdAt: purchaseOrderLineItems.createdAt,
      updatedAt: purchaseOrderLineItems.updatedAt,
    })
    .from(purchaseOrderLineItems)
    .where(eq(purchaseOrderLineItems.purchaseOrderId, purchaseOrder.id))
    .orderBy(asc(purchaseOrderLineItems.lineNumber));

  return { ...purchaseOrder, lineItems };
}
