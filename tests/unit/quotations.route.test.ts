import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvalidQuotationLineItemsError extends Error {}
  class IncompleteQuotationError extends Error {}
  class QuotationConflictError extends Error {}
  class QuotationDeadlinePassedError extends Error {}
  class RfqNotOpenForQuotingError extends Error {}

  return {
    getVendorQuotationAccess: vi.fn(),
    getCurrentVendorQuotation: vi.fn(),
    saveVendorQuotationDraft: vi.fn(),
    submitVendorQuotation: vi.fn(),
    InvalidQuotationLineItemsError,
    IncompleteQuotationError,
    QuotationConflictError,
    QuotationDeadlinePassedError,
    RfqNotOpenForQuotingError,
  };
});

vi.mock("@/lib/quotation-access", () => ({
  getVendorQuotationAccess: mocks.getVendorQuotationAccess,
}));

vi.mock("@/lib/quotations", () => ({
  getCurrentVendorQuotation: mocks.getCurrentVendorQuotation,
  saveVendorQuotationDraft: mocks.saveVendorQuotationDraft,
  submitVendorQuotation: mocks.submitVendorQuotation,
  InvalidQuotationLineItemsError: mocks.InvalidQuotationLineItemsError,
  IncompleteQuotationError: mocks.IncompleteQuotationError,
  QuotationConflictError: mocks.QuotationConflictError,
  QuotationDeadlinePassedError: mocks.QuotationDeadlinePassedError,
  RfqNotOpenForQuotingError: mocks.RfqNotOpenForQuotingError,
}));

import {
  GET,
  POST as saveDraft,
  PUT,
} from "@/app/api/rfqs/[rfqId]/quotation/route";
import { POST as submit } from "@/app/api/rfqs/[rfqId]/quotation/submit/route";

const rfqId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const lineItemId = "c1111111-1111-4111-8111-111111111111";

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

function context(id = rfqId) {
  return { params: Promise.resolve({ rfqId: id }) };
}

function request(method: string, body?: unknown) {
  return new Request(`http://localhost/api/rfqs/${rfqId}/quotation`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const draft = { lineItems: [{ rfqLineItemId: lineItemId, unitPrice: "125.50" }] };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("vendor quotation routes", () => {
  it("returns 401 before reading a quotation for an unauthenticated request", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue({ kind: "unauthenticated" });

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(401);
    expect(mocks.getCurrentVendorQuotation).not.toHaveBeenCalled();
  });

  it("allows only the membership-resolved assigned vendor to retrieve its quotation", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue(access);
    mocks.getCurrentVendorQuotation.mockResolvedValue({ id: "d1111111-1111-4111-8111-111111111111" });

    const response = await GET(request("GET"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      quotation: { id: "d1111111-1111-4111-8111-111111111111" },
    });
    expect(mocks.getVendorQuotationAccess).toHaveBeenCalledWith(rfqId);
    expect(mocks.getCurrentVendorQuotation).toHaveBeenCalledWith(access);
  });

  it("hides unassigned RFQs and rejects invalid route IDs", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue({ kind: "not-found" });

    const unassigned = await GET(request("GET"), context());
    const invalidId = await GET(request("GET"), context("not-a-uuid"));

    expect(unassigned.status).toBe(404);
    expect(invalidId.status).toBe(404);
    expect(mocks.getVendorQuotationAccess).toHaveBeenCalledTimes(1);
  });

  it("rejects forged user or vendor IDs and invalid prices before saving", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue(access);

    const response = await saveDraft(
      request("POST", { ...draft, vendorId, userId: "e1111111-1111-4111-8111-111111111111" }),
      context(),
    );

    expect(response.status).toBe(400);
    expect(mocks.saveVendorQuotationDraft).not.toHaveBeenCalled();
  });

  it("creates and updates a draft with the server-resolved vendor access only", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue(access);
    mocks.saveVendorQuotationDraft.mockResolvedValue({ id: "d1111111-1111-4111-8111-111111111111", status: "DRAFT" });

    const created = await saveDraft(request("POST", draft), context());
    const updated = await PUT(request("PUT", { ...draft, lineItems: [{ ...draft.lineItems[0], unitPrice: "130.00" }] }), context());

    expect(created.status).toBe(200);
    expect(updated.status).toBe(200);
    expect(mocks.saveVendorQuotationDraft).toHaveBeenNthCalledWith(1, access, draft);
    expect(mocks.saveVendorQuotationDraft).toHaveBeenNthCalledWith(2, access, {
      lineItems: [{ rfqLineItemId: lineItemId, unitPrice: "130.00" }],
    });
  });

  it("maps an invalid cross-RFQ line item to a client error", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue(access);
    mocks.saveVendorQuotationDraft.mockRejectedValue(new mocks.InvalidQuotationLineItemsError());

    const response = await saveDraft(request("POST", draft), context());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "One or more quoted line items do not belong to this RFQ.",
    });
  });

  it("submits only through the assigned vendor endpoint and maps deadline, completeness, and conflicts", async () => {
    mocks.getVendorQuotationAccess.mockResolvedValue(access);
    mocks.submitVendorQuotation.mockRejectedValueOnce(new mocks.IncompleteQuotationError());
    const incomplete = await submit(request("POST", draft), context());

    mocks.submitVendorQuotation.mockRejectedValueOnce(new mocks.QuotationDeadlinePassedError());
    const expired = await submit(request("POST", draft), context());

    mocks.submitVendorQuotation.mockRejectedValueOnce(new mocks.QuotationConflictError("The quotation was submitted concurrently."));
    const duplicate = await submit(request("POST", draft), context());

    expect(incomplete.status).toBe(400);
    expect(expired.status).toBe(409);
    expect(duplicate.status).toBe(409);
    expect(mocks.submitVendorQuotation).toHaveBeenCalledWith(access, draft);
  });
});
