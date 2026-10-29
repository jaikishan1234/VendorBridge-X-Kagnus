import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  txUpdate: vi.fn(),
  txDelete: vi.fn(),
  lockFor: vi.fn(),
  lineItemValues: vi.fn(),
  deleteWhere: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  quotationValues: vi.fn(),
  quotationOnConflict: vi.fn(),
  quotationReturning: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { transaction: mocks.transaction },
}));

import { quotationLineItems, quotations } from "@/db/schema";
import {
  QuotationConflictError,
  QuotationDeadlinePassedError,
  RfqNotOpenForQuotingError,
  saveVendorQuotationDraft,
  submitVendorQuotation,
} from "@/lib/quotations";

const rfqId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const lineItemId = "c1111111-1111-4111-8111-111111111111";
const quotationId = "d1111111-1111-4111-8111-111111111111";

const access = {
  kind: "vendor" as const,
  vendorId,
  rfq: {
    id: rfqId,
    status: "OPEN" as const,
    deadline: new Date("2100-01-01T00:00:00.000Z"),
    currency: "USD",
  },
};

const lineItems = [{ rfqLineItemId: lineItemId, unitPrice: "25.00" }];

function lockedRfqQuery(rfq: { status: "DRAFT" | "OPEN"; deadline: Date }) {
  const limit = vi.fn().mockResolvedValue([rfq]);
  mocks.lockFor.mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ for: mocks.lockFor });
  return { from: vi.fn().mockReturnValue({ where }) };
}

function rfqLineItemsQuery(ids = [lineItemId]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(ids.map((id) => ({ id }))),
    }),
  };
}

function quotationQuery(quotation?: { id: string; status: "DRAFT" | "SUBMITTED" }) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(quotation ? [quotation] : []),
      }),
    }),
  };
}

function configureTransaction(options: {
  rfq?: { status: "DRAFT" | "OPEN"; deadline: Date };
  quotation?: { id: string; status: "DRAFT" | "SUBMITTED" };
  updateResults?: Array<{ id: string }[]>;
} = {}) {
  const rfq = options.rfq ?? { status: "OPEN" as const, deadline: new Date("2100-01-01T00:00:00.000Z") };
  mocks.txSelect.mockReturnValueOnce(lockedRfqQuery(rfq));
  mocks.txSelect.mockReturnValueOnce(rfqLineItemsQuery());
  mocks.txSelect.mockReturnValueOnce(quotationQuery(options.quotation));

  mocks.quotationReturning.mockResolvedValue([
    { id: quotationId, status: "DRAFT" },
  ]);
  mocks.quotationOnConflict.mockReturnValue({ returning: mocks.quotationReturning });
  mocks.quotationValues.mockReturnValue({ onConflictDoNothing: mocks.quotationOnConflict });
  mocks.lineItemValues.mockResolvedValue(undefined);
  mocks.txInsert.mockImplementation((table) => {
    if (table === quotations) return { values: mocks.quotationValues };
    if (table === quotationLineItems) return { values: mocks.lineItemValues };
    throw new Error("Unexpected insert table");
  });

  const updateResults = options.updateResults ?? [[{ id: quotationId }]];
  mocks.updateReturning.mockImplementation(() => Promise.resolve(updateResults.shift() ?? []));
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.txUpdate.mockReturnValue({ set: mocks.updateSet });
  mocks.deleteWhere.mockResolvedValue(undefined);
  mocks.txDelete.mockReturnValue({ where: mocks.deleteWhere });
  mocks.transaction.mockImplementation((callback) =>
    callback({
      select: mocks.txSelect,
      insert: mocks.txInsert,
      update: mocks.txUpdate,
      delete: mocks.txDelete,
    }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("quotation persistence lifecycle boundary", () => {
  it("locks and re-reads the RFQ before persisting a draft", async () => {
    configureTransaction();

    await expect(saveVendorQuotationDraft(access, { lineItems })).resolves.toEqual({
      id: quotationId,
      status: "DRAFT",
    });

    expect(mocks.lockFor).toHaveBeenCalledWith("update");
    expect(mocks.quotationValues).toHaveBeenCalledWith({ rfqId, vendorId });
    expect(mocks.lineItemValues).toHaveBeenCalledWith([
      expect.objectContaining({ quotationId, rfqId, rfqLineItemId: lineItemId, unitPrice: "25.00" }),
    ]);
  });

  it("rejects a draft when the RFQ changed from OPEN before the write transaction acquired its lock", async () => {
    configureTransaction({
      rfq: { status: "DRAFT", deadline: new Date("2100-01-01T00:00:00.000Z") },
    });

    await expect(saveVendorQuotationDraft(access, { lineItems })).rejects.toBeInstanceOf(
      RfqNotOpenForQuotingError,
    );
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("rejects submission when the deadline has passed by the time the locked RFQ is checked", async () => {
    configureTransaction({
      rfq: { status: "OPEN", deadline: new Date("2000-01-01T00:00:00.000Z") },
    });

    await expect(submitVendorQuotation(access, { lineItems })).rejects.toBeInstanceOf(
      QuotationDeadlinePassedError,
    );
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("does not replace line items when a concurrent submission changes the draft before its conditional update", async () => {
    configureTransaction({
      quotation: { id: quotationId, status: "DRAFT" },
      updateResults: [[]],
    });

    await expect(saveVendorQuotationDraft(access, { lineItems })).rejects.toBeInstanceOf(
      QuotationConflictError,
    );
    expect(mocks.txDelete).not.toHaveBeenCalled();
    expect(mocks.lineItemValues).not.toHaveBeenCalled();
  });
});
