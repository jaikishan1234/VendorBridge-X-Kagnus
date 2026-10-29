import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  quotationLineItems,
  quotations,
  rfqLineItems,
  rfqs,
  vendors,
} from "@/db/schema";

type RfqSummary = {
  id: string;
  rfqNumber: string;
  title: string;
  category: string;
  currency: string;
  deadline: Date;
  status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
};

type RequestedLineItem = {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unit: string;
};

type SubmittedQuotationRow = {
  quotationId: string;
  vendorId: string;
  vendorName: string;
  submittedAt: Date | null;
  deliveryTimeline: string | null;
  notes: string | null;
  rfqLineItemId: string;
  unitPrice: string;
};

export type ComparedQuotation = {
  id: string;
  vendorId: string;
  vendorName: string;
  submittedAt: Date | null;
  deliveryTimeline: string | null;
  notes: string | null;
  lineItems: Array<{
    rfqLineItemId: string;
    unitPrice: string;
  }>;
  total: string | null;
  totalMinor: string | null;
  isComparable: boolean;
  isLowest: boolean;
};

export type QuotationComparison = {
  rfq: RfqSummary;
  lineItems: RequestedLineItem[];
  quotations: ComparedQuotation[];
};

function decimalToScaledInteger(value: string, scale: number): bigint {
  const [wholePart, fractionPart = ""] = value.split(".");
  const whole = wholePart || "0";
  const fraction = fractionPart.padEnd(scale, "0").slice(0, scale);
  return BigInt(`${whole}${fraction}`);
}

export function calculateComparableTotal(
  lineItems: Array<{ quantity: string; unitPrice: string }>,
) {
  const totalAtFiveDecimalPlaces = lineItems.reduce(
    (total, lineItem) =>
      total +
      decimalToScaledInteger(lineItem.quantity, 3) *
        decimalToScaledInteger(lineItem.unitPrice, 2),
    BigInt(0),
  );

  return {
    total: formatMoney(totalAtFiveDecimalPlaces),
    totalMinor: totalAtFiveDecimalPlaces.toString(),
  };
}

function formatMoney(totalAtFiveDecimalPlaces: bigint): string {
  // Quantities have scale 3 and unit prices scale 2. Round the product total
  // half-up to the RFQ currency's conventional two decimal places.
  const cents = (totalAtFiveDecimalPlaces + BigInt(500)) / BigInt(1_000);
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}

export function buildQuotationComparison(
  rfq: RfqSummary,
  lineItems: RequestedLineItem[],
  rows: SubmittedQuotationRow[],
): QuotationComparison {
  const requiredIds = new Set(lineItems.map((lineItem) => lineItem.id));
  const quotationsById = new Map<string, ComparedQuotation>();

  for (const row of rows) {
    const existing = quotationsById.get(row.quotationId);
    if (existing) {
      existing.lineItems.push({
        rfqLineItemId: row.rfqLineItemId,
        unitPrice: row.unitPrice,
      });
      continue;
    }

    quotationsById.set(row.quotationId, {
      id: row.quotationId,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      submittedAt: row.submittedAt,
      deliveryTimeline: row.deliveryTimeline,
      notes: row.notes,
      lineItems: [{ rfqLineItemId: row.rfqLineItemId, unitPrice: row.unitPrice }],
      total: null,
      totalMinor: null,
      isComparable: false,
      isLowest: false,
    });
  }

  const quantitiesById = new Map(
    lineItems.map((lineItem) => [lineItem.id, lineItem.quantity]),
  );
  const quotations = [...quotationsById.values()].map((quotation) => {
    const quotedIds = new Set(quotation.lineItems.map((lineItem) => lineItem.rfqLineItemId));
    const isComparable =
      quotedIds.size === requiredIds.size &&
      [...requiredIds].every((lineItemId) => quotedIds.has(lineItemId));

    if (!isComparable) return quotation;

    const total = calculateComparableTotal(
      quotation.lineItems.map((lineItem) => ({
        quantity: quantitiesById.get(lineItem.rfqLineItemId) ?? "0",
        unitPrice: lineItem.unitPrice,
      })),
    );

    return {
      ...quotation,
      isComparable: true,
      total: total.total,
      totalMinor: total.totalMinor,
    };
  });

  const lowestTotal = quotations
    .filter((quotation): quotation is ComparedQuotation & { totalMinor: string } =>
      quotation.isComparable && quotation.totalMinor !== null,
    )
    .reduce<bigint | null>(
      (lowest, quotation) => {
        const total = BigInt(quotation.totalMinor);
        return lowest === null || total < lowest ? total : lowest;
      },
      null,
    );

  if (lowestTotal !== null) {
    quotations.forEach((quotation) => {
      quotation.isLowest = quotation.totalMinor === lowestTotal.toString();
    });
  }

  return { rfq, lineItems, quotations };
}

export async function getQuotationComparison(
  rfqId: string,
): Promise<QuotationComparison | null> {
  const [rfq] = await db
    .select({
      id: rfqs.id,
      rfqNumber: rfqs.rfqNumber,
      title: rfqs.title,
      category: rfqs.category,
      currency: rfqs.currency,
      deadline: rfqs.deadline,
      status: rfqs.status,
    })
    .from(rfqs)
    .where(eq(rfqs.id, rfqId))
    .limit(1);

  if (!rfq) return null;

  const lineItems = await db
    .select({
      id: rfqLineItems.id,
      lineNumber: rfqLineItems.lineNumber,
      description: rfqLineItems.description,
      quantity: rfqLineItems.quantity,
      unit: rfqLineItems.unit,
    })
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfqId, rfqId))
    .orderBy(asc(rfqLineItems.lineNumber));

  const rows = await db
    .select({
      quotationId: quotations.id,
      vendorId: vendors.id,
      vendorName: vendors.vendorName,
      submittedAt: quotations.submittedAt,
      deliveryTimeline: quotations.deliveryTimeline,
      notes: quotations.notes,
      rfqLineItemId: quotationLineItems.rfqLineItemId,
      unitPrice: quotationLineItems.unitPrice,
    })
    .from(quotations)
    .innerJoin(vendors, eq(vendors.id, quotations.vendorId))
    .innerJoin(
      quotationLineItems,
      eq(quotationLineItems.quotationId, quotations.id),
    )
    .where(
      and(eq(quotations.rfqId, rfqId), eq(quotations.status, "SUBMITTED")),
    )
    .orderBy(asc(vendors.vendorName), asc(quotationLineItems.rfqLineItemId));

  return buildQuotationComparison(rfq, lineItems, rows);
}
