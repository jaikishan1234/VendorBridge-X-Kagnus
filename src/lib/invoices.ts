import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  invoiceLineItems,
  invoices,
  purchaseOrderLineItems,
  purchaseOrders,
  vendors,
} from "@/db/schema";

const maximumInvoiceNumberAttempts = 3;
const centsPerWholeUnit = BigInt(100);
const gstRateScale = BigInt(10_000);
const gstPercentageDenominator = BigInt(100) * gstRateScale;

export class InvoicePurchaseOrderNotFoundError extends Error {}
export class InvoicePurchaseOrderNotGeneratedError extends Error {}
export class InvoiceAlreadyExistsError extends Error {}
export class InvoiceSourceInvalidError extends Error {}
export class InvoiceGstRateConfigurationError extends Error {}

type InvoiceSourceLineItem = {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
};

type GstRate = {
  value: string;
  scaledPercentage: bigint;
};

function decimalToScaledInteger(value: string, scale: number): bigint {
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new InvoiceSourceInvalidError("Invalid persisted monetary amount.");
  }

  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) {
    throw new InvoiceSourceInvalidError("Persisted monetary amount exceeds its scale.");
  }

  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

function formatCents(cents: bigint): string {
  const whole = cents / centsPerWholeUnit;
  const fraction = (cents % centsPerWholeUnit).toString().padStart(2, "0");
  return `${whole.toString()}.${fraction}`;
}

function readGstRate(): GstRate {
  const value = process.env.INVOICE_GST_RATE?.trim();
  if (!value) {
    throw new InvoiceGstRateConfigurationError("INVOICE_GST_RATE is required.");
  }

  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) {
    throw new InvoiceGstRateConfigurationError(
      "INVOICE_GST_RATE must be a decimal percentage with at most four fractional digits.",
    );
  }

  const scaledPercentage = decimalToScaledInteger(value, 4);
  if (scaledPercentage > BigInt(100) * gstRateScale) {
    throw new InvoiceGstRateConfigurationError(
      "INVOICE_GST_RATE must be between 0 and 100 inclusive.",
    );
  }

  return { value, scaledPercentage };
}

function calculateInvoiceTotals(
  lineItems: InvoiceSourceLineItem[],
  gstRate: GstRate,
) {
  const subtotalInCents = lineItems.reduce(
    (subtotal, lineItem) =>
      subtotal + decimalToScaledInteger(lineItem.lineTotal, 2),
    BigInt(0),
  );
  const taxInCents =
    (subtotalInCents * gstRate.scaledPercentage + gstPercentageDenominator / BigInt(2)) /
    gstPercentageDenominator;
  const grandTotalInCents = subtotalInCents + taxInCents;

  return {
    subtotalAmount: formatCents(subtotalInCents),
    taxAmount: formatCents(taxInCents),
    grandTotal: formatCents(grandTotalInCents),
  };
}

function generateInvoiceNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

  return `INV-${date}-${suffix}`;
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

function isInvoiceNumberConflict(error: unknown): boolean {
  return hasConstraint(error, "invoices_invoice_number_unique");
}

function isDuplicateInvoiceConflict(error: unknown): boolean {
  return hasConstraint(error, "invoices_purchase_order_id_unique");
}

async function createInvoice(purchaseOrderId: string, gstRate: GstRate) {
  return db.transaction(async (tx) => {
    const [purchaseOrder] = await tx
      .select({
        id: purchaseOrders.id,
        vendorId: purchaseOrders.vendorId,
        status: purchaseOrders.status,
        currency: purchaseOrders.currency,
        vendorName: vendors.vendorName,
      })
      .from(purchaseOrders)
      .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
      .where(eq(purchaseOrders.id, purchaseOrderId))
      .for("update")
      .limit(1);

    if (!purchaseOrder) throw new InvoicePurchaseOrderNotFoundError();
    if (purchaseOrder.status !== "GENERATED") {
      throw new InvoicePurchaseOrderNotGeneratedError();
    }

    const [existingInvoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.purchaseOrderId, purchaseOrder.id))
      .limit(1);

    if (existingInvoice) throw new InvoiceAlreadyExistsError();

    const sourceLineItems = await tx
      .select({
        id: purchaseOrderLineItems.id,
        lineNumber: purchaseOrderLineItems.lineNumber,
        description: purchaseOrderLineItems.description,
        quantity: purchaseOrderLineItems.quantity,
        unit: purchaseOrderLineItems.unit,
        unitPrice: purchaseOrderLineItems.unitPrice,
        lineTotal: purchaseOrderLineItems.lineTotal,
      })
      .from(purchaseOrderLineItems)
      .where(eq(purchaseOrderLineItems.purchaseOrderId, purchaseOrder.id))
      .orderBy(asc(purchaseOrderLineItems.lineNumber));

    if (sourceLineItems.length === 0) {
      throw new InvoiceSourceInvalidError("Purchase order has no line items.");
    }

    const totals = calculateInvoiceTotals(sourceLineItems, gstRate);
    const issuedAt = new Date();
    const [invoice] = await tx
      .insert(invoices)
      .values({
        invoiceNumber: generateInvoiceNumber(issuedAt),
        purchaseOrderId: purchaseOrder.id,
        vendorId: purchaseOrder.vendorId,
        currency: purchaseOrder.currency,
        subtotalAmount: totals.subtotalAmount,
        gstRate: gstRate.value,
        taxAmount: totals.taxAmount,
        grandTotal: totals.grandTotal,
        issuedAt,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      })
      .returning({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        purchaseOrderId: invoices.purchaseOrderId,
        vendorId: invoices.vendorId,
        status: invoices.status,
        currency: invoices.currency,
        subtotalAmount: invoices.subtotalAmount,
        gstRate: invoices.gstRate,
        taxAmount: invoices.taxAmount,
        grandTotal: invoices.grandTotal,
        issuedAt: invoices.issuedAt,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      });

    const lineItems = await tx
      .insert(invoiceLineItems)
      .values(
        sourceLineItems.map((lineItem) => ({
          invoiceId: invoice.id,
          purchaseOrderId: purchaseOrder.id,
          purchaseOrderLineItemId: lineItem.id,
          lineNumber: lineItem.lineNumber,
          description: lineItem.description,
          quantity: lineItem.quantity,
          unit: lineItem.unit,
          unitPrice: lineItem.unitPrice,
          lineTotal: lineItem.lineTotal,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        })),
      )
      .returning({
        id: invoiceLineItems.id,
        invoiceId: invoiceLineItems.invoiceId,
        purchaseOrderId: invoiceLineItems.purchaseOrderId,
        purchaseOrderLineItemId: invoiceLineItems.purchaseOrderLineItemId,
        lineNumber: invoiceLineItems.lineNumber,
        description: invoiceLineItems.description,
        quantity: invoiceLineItems.quantity,
        unit: invoiceLineItems.unit,
        unitPrice: invoiceLineItems.unitPrice,
        lineTotal: invoiceLineItems.lineTotal,
        createdAt: invoiceLineItems.createdAt,
        updatedAt: invoiceLineItems.updatedAt,
      });

    return { ...invoice, lineItems };
  });
}

export async function generateInvoice(
  purchaseOrderId: string,
  generatedByUserId: string,
) {
  // The applied invoice schema does not include generated_by_user_id. Keep the
  // authenticated server-side identity in the domain API for future auditing.
  void generatedByUserId;
  const gstRate = readGstRate();

  for (let attempt = 0; attempt < maximumInvoiceNumberAttempts; attempt += 1) {
    try {
      return await createInvoice(purchaseOrderId, gstRate);
    } catch (error) {
      if (isDuplicateInvoiceConflict(error)) {
        throw new InvoiceAlreadyExistsError();
      }

      if (isInvoiceNumberConflict(error) && attempt < maximumInvoiceNumberAttempts - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to generate a unique invoice number.");
}

export async function getInvoices(vendorId?: string) {
  const selection = {
    id: invoices.id,
    invoiceNumber: invoices.invoiceNumber,
    purchaseOrderId: invoices.purchaseOrderId,
    vendorId: invoices.vendorId,
    status: invoices.status,
    currency: invoices.currency,
    subtotalAmount: invoices.subtotalAmount,
    gstRate: invoices.gstRate,
    taxAmount: invoices.taxAmount,
    grandTotal: invoices.grandTotal,
    issuedAt: invoices.issuedAt,
    createdAt: invoices.createdAt,
    updatedAt: invoices.updatedAt,
  };

  const query = db.select(selection).from(invoices);

  if (vendorId) {
    return query
      .where(eq(invoices.vendorId, vendorId))
      .orderBy(desc(invoices.issuedAt));
  }

  return query.orderBy(desc(invoices.issuedAt));
}

export async function getInvoice(invoiceId: string, vendorId?: string) {
  const [invoice] = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      purchaseOrderId: invoices.purchaseOrderId,
      vendorId: invoices.vendorId,
      status: invoices.status,
      currency: invoices.currency,
      subtotalAmount: invoices.subtotalAmount,
      gstRate: invoices.gstRate,
      taxAmount: invoices.taxAmount,
      grandTotal: invoices.grandTotal,
      issuedAt: invoices.issuedAt,
      createdAt: invoices.createdAt,
      updatedAt: invoices.updatedAt,
    })
    .from(invoices)
    .where(
      vendorId
        ? and(eq(invoices.id, invoiceId), eq(invoices.vendorId, vendorId))
        : eq(invoices.id, invoiceId),
    )
    .limit(1);

  if (!invoice) return null;

  const lineItems = await db
    .select({
      id: invoiceLineItems.id,
      invoiceId: invoiceLineItems.invoiceId,
      purchaseOrderId: invoiceLineItems.purchaseOrderId,
      purchaseOrderLineItemId: invoiceLineItems.purchaseOrderLineItemId,
      lineNumber: invoiceLineItems.lineNumber,
      description: invoiceLineItems.description,
      quantity: invoiceLineItems.quantity,
      unit: invoiceLineItems.unit,
      unitPrice: invoiceLineItems.unitPrice,
      lineTotal: invoiceLineItems.lineTotal,
      createdAt: invoiceLineItems.createdAt,
      updatedAt: invoiceLineItems.updatedAt,
    })
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoice.id))
    .orderBy(asc(invoiceLineItems.lineNumber));

  return { ...invoice, lineItems };
}
