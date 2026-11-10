import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn(), select: vi.fn() }));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction, select: mocks.select } }));

import { activityEvents, purchaseOrderLineItems, purchaseOrders } from "@/db/schema";
import {
  generatePurchaseOrder,
  getPurchaseOrders,
  PurchaseOrderAlreadyExistsError,
  PurchaseOrderApprovalNotApprovedError,
  PurchaseOrderApprovalNotFoundError,
  PurchaseOrderSourceInvalidError,
} from "@/lib/purchase-orders";

const approvalId = "a1111111-1111-4111-8111-111111111111";
const quotationId = "b1111111-1111-4111-8111-111111111111";
const rfqId = "c1111111-1111-4111-8111-111111111111";
const vendorId = "d1111111-1111-4111-8111-111111111111";
const generatedByUserId = "e1111111-1111-4111-8111-111111111111";
const purchaseOrderId = "f1111111-1111-4111-8111-111111111111";
const firstRfqLineItemId = "01111111-1111-4111-8111-111111111111";
const secondRfqLineItemId = "02222222-2222-4222-8222-222222222222";

const approvedApproval = {
  id: approvalId,
  status: "APPROVED" as const,
  quotationId,
  rfqId,
  vendorId,
};

const source = { quotationId, rfqId, vendorId, currency: "USD" };

const requiredLineItems = [
  {
    id: firstRfqLineItemId,
    lineNumber: 1,
    description: "Fractional unit",
    quantity: "0.500",
    unit: "Each",
  },
  {
    id: secondRfqLineItemId,
    lineNumber: 2,
    description: "Service",
    quantity: "1.000",
    unit: "Hour",
  },
];

const quotedLineItems = [
  { rfqId, rfqLineItemId: firstRfqLineItemId, unitPrice: "0.01" },
  { rfqId, rfqLineItemId: secondRfqLineItemId, unitPrice: "2.00" },
];

const createdPurchaseOrder = {
  id: purchaseOrderId,
  poNumber: "PO-21000101-ABCDEF123456",
  approvalRequestId: approvalId,
  quotationId,
  rfqId,
  vendorId,
  generatedByUserId,
  status: "GENERATED" as const,
  currency: "USD",
  totalAmount: "2.01",
  generatedAt: new Date("2100-01-01T00:00:00.000Z"),
  createdAt: new Date("2100-01-01T00:00:00.000Z"),
  updatedAt: new Date("2100-01-01T00:00:00.000Z"),
};

const createdLineItems = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    purchaseOrderId,
    rfqId,
    rfqLineItemId: firstRfqLineItemId,
    lineNumber: 1,
    description: "Fractional unit",
    quantity: "0.500",
    unit: "Each",
    unitPrice: "0.01",
    lineTotal: "0.01",
    createdAt: new Date("2100-01-01T00:00:00.000Z"),
    updatedAt: new Date("2100-01-01T00:00:00.000Z"),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    purchaseOrderId,
    rfqId,
    rfqLineItemId: secondRfqLineItemId,
    lineNumber: 2,
    description: "Service",
    quantity: "1.000",
    unit: "Hour",
    unitPrice: "2.00",
    lineTotal: "2.00",
    createdAt: new Date("2100-01-01T00:00:00.000Z"),
    updatedAt: new Date("2100-01-01T00:00:00.000Z"),
  },
];

function query(result: unknown, lockForUpdate: ReturnType<typeof vi.fn>) {
  const promise = Promise.resolve(result);
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    innerJoin: vi.fn(),
    orderBy: vi.fn(),
    for: lockForUpdate,
    limit: vi.fn(),
    then: promise.then.bind(promise),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(promise);
  chain.for.mockReturnValue(chain);
  chain.limit.mockReturnValue(promise);

  return chain;
}

function listQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const chain = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(promise);

  return chain;
}

function createTransaction(options: {
  approval?: typeof approvedApproval | { id: string; status: "PENDING" };
  existingPurchaseOrder?: Array<{ id: string }>;
  source?: typeof source[];
  requiredLineItems?: typeof requiredLineItems;
  quotedLineItems?: typeof quotedLineItems;
  headerError?: unknown;
  lineItemError?: unknown;
  activityEventError?: unknown;
} = {}) {
  const results = [
    options.approval === undefined ? [approvedApproval] : [options.approval],
    options.existingPurchaseOrder ?? [],
    options.source ?? [source],
    options.requiredLineItems ?? requiredLineItems,
    options.quotedLineItems ?? quotedLineItems,
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
      : Promise.resolve([createdPurchaseOrder]),
  );
  lineItemReturning.mockImplementation(() =>
    options.lineItemError
      ? Promise.reject(options.lineItemError)
      : Promise.resolve(createdLineItems),
  );
  activityEventValues.mockImplementation(() =>
    options.activityEventError ? Promise.reject(options.activityEventError) : Promise.resolve(),
  );

  const insert = vi.fn((table) => {
    if (table === purchaseOrders) return { values: headerValues };
    if (table === purchaseOrderLineItems) return { values: lineItemValues };
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

beforeEach(() => vi.resetAllMocks());

describe("purchase order persistence", () => {
  it("builds the PO list query from the exported purchaseOrders table", async () => {
    const list = listQuery([]);
    mocks.select.mockReturnValue(list);

    await expect(getPurchaseOrders()).resolves.toEqual([]);
    expect(mocks.select).toHaveBeenCalledWith(expect.objectContaining({
      id: purchaseOrders.id,
      poNumber: purchaseOrders.poNumber,
    }));
    expect(list.from).toHaveBeenCalledWith(purchaseOrders);
  });

  it("locks an approved approval and persists authoritative header and line snapshots", async () => {
    const transaction = createTransaction();
    useTransactions(transaction);

    const purchaseOrder = await generatePurchaseOrder(approvalId, generatedByUserId);

    expect(transaction.lockForUpdate).toHaveBeenCalledWith("update");
    expect(transaction.headerValues).toHaveBeenCalledWith(expect.objectContaining({
      approvalRequestId: approvalId,
      quotationId,
      rfqId,
      vendorId,
      generatedByUserId,
      currency: "USD",
      totalAmount: "2.01",
      poNumber: expect.stringMatching(/^PO-\d{8}-[A-F0-9]{12}$/),
    }));
    expect(transaction.lineItemValues).toHaveBeenCalledWith([
      expect.objectContaining({
        rfqId,
        rfqLineItemId: firstRfqLineItemId,
        quantity: "0.500",
        unitPrice: "0.01",
        lineTotal: "0.01",
      }),
      expect.objectContaining({
        rfqId,
        rfqLineItemId: secondRfqLineItemId,
        quantity: "1.000",
        unitPrice: "2.00",
        lineTotal: "2.00",
      }),
    ]);
    expect(transaction.activityEventValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "PURCHASE_ORDER_GENERATED",
      actorUserId: generatedByUserId,
      affectedEntityType: "PURCHASE_ORDER",
      affectedEntityId: purchaseOrderId,
      rfqId,
      quotationId,
      approvalRequestId: approvalId,
      vendorId,
      purchaseOrderId,
      metadata: {},
    }));
    expect(purchaseOrder).toEqual({ ...createdPurchaseOrder, lineItems: createdLineItems });
  });

  it("rejects an approval that is not approved before loading source data", async () => {
    const transaction = createTransaction({
      approval: { id: approvalId, status: "PENDING" },
    });
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toBeInstanceOf(
      PurchaseOrderApprovalNotApprovedError,
    );
    expect(transaction.tx.select).toHaveBeenCalledOnce();
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a missing approval", async () => {
    const transaction = createTransaction({ approval: undefined });
    transaction.tx.select.mockImplementationOnce(() => query([], transaction.lockForUpdate));
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toBeInstanceOf(
      PurchaseOrderApprovalNotFoundError,
    );
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", [{ rfqId, rfqLineItemId: firstRfqLineItemId, unitPrice: "0.01" }]],
    [
      "duplicate",
      [
        { rfqId, rfqLineItemId: firstRfqLineItemId, unitPrice: "0.01" },
        { rfqId, rfqLineItemId: firstRfqLineItemId, unitPrice: "0.01" },
      ],
    ],
    ["unrelated", [{ rfqId, rfqLineItemId: "09999999-9999-4999-8999-999999999999", unitPrice: "0.01" }]],
  ])("rejects %s quotation line items", async (_caseName, invalidQuotedLineItems) => {
    const transaction = createTransaction({
      quotedLineItems: invalidQuotedLineItems as typeof quotedLineItems,
    });
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toBeInstanceOf(
      PurchaseOrderSourceInvalidError,
    );
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("rejects a previously generated purchase order", async () => {
    const transaction = createTransaction({
      existingPurchaseOrder: [{ id: purchaseOrderId }],
    });
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toBeInstanceOf(
      PurchaseOrderAlreadyExistsError,
    );
    expect(transaction.tx.insert).not.toHaveBeenCalled();
  });

  it("retries the whole transaction after a PO-number collision", async () => {
    const conflictingTransaction = createTransaction({
      headerError: {
        code: "23505",
        constraint: "purchase_orders_po_number_unique",
      },
    });
    const successfulTransaction = createTransaction();
    useTransactions(conflictingTransaction, successfulTransaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).resolves.toEqual({
      ...createdPurchaseOrder,
      lineItems: createdLineItems,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(conflictingTransaction.lineItemValues).not.toHaveBeenCalled();
    expect(successfulTransaction.lineItemValues).toHaveBeenCalledOnce();
  });

  it("returns a duplicate-PO conflict for a database uniqueness backstop", async () => {
    const transaction = createTransaction({
      headerError: {
        code: "23505",
        constraint: "purchase_orders_quotation_id_unique",
      },
    });
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toBeInstanceOf(
      PurchaseOrderAlreadyExistsError,
    );
  });

  it("propagates line-item insertion failure so the transaction rolls back", async () => {
    const transaction = createTransaction({ lineItemError: new Error("line insert failed") });
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toThrow(
      "line insert failed",
    );
    expect(transaction.headerValues).toHaveBeenCalledOnce();
    expect(transaction.lineItemValues).toHaveBeenCalledOnce();
  });

  it("propagates activity-event insertion failure so the transaction rolls back", async () => {
    const transaction = createTransaction({ activityEventError: new Error("activity insert failed") });
    useTransactions(transaction);

    await expect(generatePurchaseOrder(approvalId, generatedByUserId)).rejects.toThrow(
      "activity insert failed",
    );
    expect(transaction.headerValues).toHaveBeenCalledOnce();
    expect(transaction.lineItemValues).toHaveBeenCalledOnce();
    expect(transaction.activityEventValues).toHaveBeenCalledOnce();
  });
});
