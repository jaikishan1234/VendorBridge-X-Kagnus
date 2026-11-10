import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { activityEvents, invoiceLineItems, invoices } from "@/db/schema";
import {
  generateInvoice,
  InvoiceAlreadyExistsError,
  InvoiceGstRateConfigurationError,
  InvoicePurchaseOrderNotFoundError,
  InvoicePurchaseOrderNotGeneratedError,
} from "@/lib/invoices";

const purchaseOrderId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const generatedByUserId = "c1111111-1111-4111-8111-111111111111";
const invoiceId = "d1111111-1111-4111-8111-111111111111";
const firstPurchaseOrderLineItemId = "e1111111-1111-4111-8111-111111111111";
const secondPurchaseOrderLineItemId = "f1111111-1111-4111-8111-111111111111";

const generatedPurchaseOrder = {
  id: purchaseOrderId,
  vendorId,
  status: "GENERATED",
  currency: "INR",
  vendorName: "Acme Supplies",
};

const sourceLineItems = [
  {
    id: firstPurchaseOrderLineItemId,
    lineNumber: 1,
    description: "Laptop",
    quantity: "1.000",
    unit: "Each",
    unitPrice: "1.00",
    lineTotal: "1.00",
  },
  {
    id: secondPurchaseOrderLineItemId,
    lineNumber: 2,
    description: "Support",
    quantity: "2.000",
    unit: "Hour",
    unitPrice: "2.00",
    lineTotal: "4.00",
  },
];

const createdInvoice = {
  id: invoiceId,
  invoiceNumber: "INV-21000101-ABCDEF123456",
  purchaseOrderId,
  vendorId,
  status: "GENERATED",
  currency: "INR",
  subtotalAmount: "5.00",
  gstRate: "18.0000",
  taxAmount: "0.90",
  grandTotal: "5.90",
  issuedAt: new Date("2100-01-01T00:00:00.000Z"),
  createdAt: new Date("2100-01-01T00:00:00.000Z"),
  updatedAt: new Date("2100-01-01T00:00:00.000Z"),
};

const createdInvoiceLineItems = sourceLineItems.map((lineItem, index) => ({
  id: `${index + 1}1111111-1111-4111-8111-111111111111`,
  invoiceId,
  purchaseOrderId,
  purchaseOrderLineItemId: lineItem.id,
  lineNumber: lineItem.lineNumber,
  description: lineItem.description,
  quantity: lineItem.quantity,
  unit: lineItem.unit,
  unitPrice: lineItem.unitPrice,
  lineTotal: lineItem.lineTotal,
  createdAt: new Date("2100-01-01T00:00:00.000Z"),
  updatedAt: new Date("2100-01-01T00:00:00.000Z"),
}));

function query(result: unknown, lockForUpdate: ReturnType<typeof vi.fn>) {
  const promise = Promise.resolve(result);
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    for: lockForUpdate,
    limit: vi.fn(),
    then: promise.then.bind(promise),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(promise);
  chain.for.mockReturnValue(chain);
  chain.limit.mockReturnValue(promise);

  return chain;
}

function createTransaction(options: {
  purchaseOrderResult?: unknown[];
  existingInvoice?: Array<{ id: string }>;
  sourceLines?: typeof sourceLineItems;
  headerError?: unknown;
  lineItemError?: unknown;
  activityEventError?: unknown;
} = {}) {
  const results = [
    options.purchaseOrderResult ?? [generatedPurchaseOrder],
    options.existingInvoice ?? [],
    options.sourceLines ?? sourceLineItems,
  ];
  const lockForUpdate = vi.fn();
  const select = vi.fn(() => query(results.shift() ?? [], lockForUpdate));
  const headerValues = vi.fn();
  const lineItemValues = vi.fn();
  const headerReturning = vi.fn();
  const lineItemReturning = vi.fn();
  const activityEventValues = vi.fn();

  headerValues.mockReturnValue({ returning: headerReturning });
  lineItemValues.mockReturnValue({ returning: lineItemReturning });
  headerReturning.mockImplementation(() =>
    options.headerError
      ? Promise.reject(options.headerError)
      : Promise.resolve([createdInvoice]),
  );
  lineItemReturning.mockImplementation(() =>
    options.lineItemError
      ? Promise.reject(options.lineItemError)
      : Promise.resolve(createdInvoiceLineItems),
  );
  activityEventValues.mockImplementation(() =>
    options.activityEventError ? Promise.reject(options.activityEventError) : Promise.resolve(),
  );

  const insert = vi.fn((table) => {
    if (table === invoices) return { values: headerValues };
    if (table === invoiceLineItems) return { values: lineItemValues };
    if (table === activityEvents) return { values: activityEventValues };
    throw new Error("Unexpected insert table");
  });

  return {
    tx: { select, insert },
    lockForUpdate,
    headerValues,
    lineItemValues,
    activityEventValues,
  };
}

function useTransactions(...transactions: Array<ReturnType<typeof createTransaction>>) {
  mocks.transaction.mockImplementation((callback) => {
    const transaction = transactions.shift();
    if (!transaction) throw new Error("Unexpected transaction");
    return callback(transaction.tx);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("INVOICE_GST_RATE", "18.0000");
});

afterEach(() => vi.unstubAllEnvs());

describe("invoice persistence", () => {
  it("locks a generated PO and persists invoice and line snapshots", async () => {
    const transaction = createTransaction();
    useTransactions(transaction);

    const invoice = await generateInvoice(purchaseOrderId, generatedByUserId);

    expect(transaction.lockForUpdate).toHaveBeenCalledWith("update");
    expect(transaction.headerValues).toHaveBeenCalledWith(expect.objectContaining({
      purchaseOrderId,
      vendorId,
      generatedByUserId,
      currency: "INR",
      gstRate: "18.0000",
      subtotalAmount: "5.00",
      taxAmount: "0.90",
      grandTotal: "5.90",
      invoiceNumber: expect.stringMatching(/^INV-\d{8}-[A-F0-9]{12}$/),
    }));
    expect(transaction.lineItemValues).toHaveBeenCalledWith([
      expect.objectContaining({
        invoiceId,
        purchaseOrderId,
        purchaseOrderLineItemId: firstPurchaseOrderLineItemId,
        description: "Laptop",
        quantity: "1.000",
        unit: "Each",
        unitPrice: "1.00",
        lineTotal: "1.00",
      }),
      expect.objectContaining({
        invoiceId,
        purchaseOrderId,
        purchaseOrderLineItemId: secondPurchaseOrderLineItemId,
        description: "Support",
        quantity: "2.000",
        unit: "Hour",
        unitPrice: "2.00",
        lineTotal: "4.00",
      }),
    ]);
    expect(transaction.activityEventValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "INVOICE_GENERATED",
      actorUserId: generatedByUserId,
      affectedEntityType: "INVOICE",
      affectedEntityId: invoiceId,
      vendorId,
      purchaseOrderId,
      invoiceId,
      metadata: {},
    }));
    expect(invoice).toEqual({ ...createdInvoice, lineItems: createdInvoiceLineItems });
  });

  it("calculates GST with half-up cent rounding from persisted line totals", async () => {
    const transaction = createTransaction({
      sourceLines: [{ ...sourceLineItems[0], lineTotal: "1.00" }],
    });
    useTransactions(transaction);
    vi.stubEnv("INVOICE_GST_RATE", "12.5000");

    await generateInvoice(purchaseOrderId, generatedByUserId);

    expect(transaction.headerValues).toHaveBeenCalledWith(expect.objectContaining({
      subtotalAmount: "1.00",
      gstRate: "12.5000",
      taxAmount: "0.13",
      grandTotal: "1.13",
    }));
  });

  it.each([
    ["missing", ""],
    ["non-numeric", "invalid"],
    ["negative", "-0.01"],
    ["over 100", "100.0001"],
    ["excessive precision", "18.00001"],
  ])("rejects %s GST configuration", async (_caseName, value) => {
    vi.stubEnv("INVOICE_GST_RATE", value);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toBeInstanceOf(
      InvoiceGstRateConfigurationError,
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing purchase order", async () => {
    const transaction = createTransaction({ purchaseOrderResult: [] });
    useTransactions(transaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toBeInstanceOf(
      InvoicePurchaseOrderNotFoundError,
    );
    expect(transaction.lockForUpdate).toHaveBeenCalledWith("update");
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a purchase order that is not generated", async () => {
    const transaction = createTransaction({
      purchaseOrderResult: [{ ...generatedPurchaseOrder, status: "CANCELLED" }],
    });
    useTransactions(transaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toBeInstanceOf(
      InvoicePurchaseOrderNotGeneratedError,
    );
    expect(transaction.tx.select).toHaveBeenCalledOnce();
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("rejects an invoice that already exists for the purchase order", async () => {
    const transaction = createTransaction({ existingInvoice: [{ id: invoiceId }] });
    useTransactions(transaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toBeInstanceOf(
      InvoiceAlreadyExistsError,
    );
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("retries the whole transaction after an invoice-number collision", async () => {
    const conflictingTransaction = createTransaction({
      headerError: { code: "23505", constraint: "invoices_invoice_number_unique" },
    });
    const successfulTransaction = createTransaction();
    useTransactions(conflictingTransaction, successfulTransaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).resolves.toEqual({
      ...createdInvoice,
      lineItems: createdInvoiceLineItems,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(conflictingTransaction.lineItemValues).not.toHaveBeenCalled();
    expect(successfulTransaction.lineItemValues).toHaveBeenCalledOnce();
  });

  it("maps the database duplicate-invoice backstop to a domain conflict", async () => {
    const transaction = createTransaction({
      headerError: { code: "23505", constraint: "invoices_purchase_order_id_unique" },
    });
    useTransactions(transaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toBeInstanceOf(
      InvoiceAlreadyExistsError,
    );
  });

  it("propagates line insertion failure so the transaction rolls back the header", async () => {
    const transaction = createTransaction({ lineItemError: new Error("line insert failed") });
    useTransactions(transaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toThrow(
      "line insert failed",
    );
    expect(transaction.headerValues).toHaveBeenCalledOnce();
    expect(transaction.lineItemValues).toHaveBeenCalledOnce();
  });

  it("propagates activity-event insertion failure so the transaction rolls back", async () => {
    const transaction = createTransaction({ activityEventError: new Error("activity insert failed") });
    useTransactions(transaction);

    await expect(generateInvoice(purchaseOrderId, generatedByUserId)).rejects.toThrow(
      "activity insert failed",
    );
    expect(transaction.headerValues).toHaveBeenCalledOnce();
    expect(transaction.lineItemValues).toHaveBeenCalledOnce();
    expect(transaction.activityEventValues).toHaveBeenCalledOnce();
  });
});
