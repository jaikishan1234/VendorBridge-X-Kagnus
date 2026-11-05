"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PurchaseOrderListItem = {
  id: string;
  poNumber: string;
  quotationId: string;
  rfqId: string;
  status: "GENERATED";
  currency: string;
  totalAmount: string;
  generatedAt: string;
  rfqNumber: string;
  rfqTitle: string;
  vendorName: string;
};

type ApprovedQuotation = {
  approvalRequestId: string;
  quotationId: string;
  rfqId: string;
  rfqNumber: string;
  rfqTitle: string;
  vendorName: string;
  currency: string;
  approvedAt: string;
};

type PurchaseOrderCollection = {
  purchaseOrders: PurchaseOrderListItem[];
  approvedQuotations: ApprovedQuotation[];
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

async function requestPurchaseOrders(): Promise<PurchaseOrderCollection> {
  const response = await fetch("/api/purchase-orders");
  const payload = await response.json().catch(() => null) as PurchaseOrderCollection & { message?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.message ?? "Unable to load purchase orders.");
  }

  return {
    purchaseOrders: payload?.purchaseOrders ?? [],
    approvedQuotations: payload?.approvedQuotations ?? [],
  };
}

export function PurchaseOrdersPanel({ isProcurement }: { isProcurement: boolean }) {
  const [collection, setCollection] = useState<PurchaseOrderCollection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generatingApprovalId, setGeneratingApprovalId] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccess, setGenerationSuccess] = useState<string | null>(null);

  async function loadPurchaseOrders() {
    setIsLoading(true);
    setLoadError(null);

    try {
      setCollection(await requestPurchaseOrders());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load purchase orders. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    void requestPurchaseOrders()
      .then((nextCollection) => {
        if (isCurrent) setCollection(nextCollection);
      })
      .catch((error: unknown) => {
        if (isCurrent) setLoadError(error instanceof Error ? error.message : "Unable to load purchase orders. Please try again.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  async function generatePurchaseOrder(approvalRequestId: string) {
    setGeneratingApprovalId(approvalRequestId);
    setGenerationError(null);
    setGenerationSuccess(null);

    try {
      const response = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalRequestId }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) {
        setGenerationError(payload?.message ?? "Unable to generate a purchase order.");
        return;
      }

      setGenerationSuccess(payload?.message ?? "Purchase order generated.");
      await loadPurchaseOrders();
    } catch {
      setGenerationError("Unable to generate a purchase order. Please try again.");
    } finally {
      setGeneratingApprovalId(null);
    }
  }

  const purchaseOrders = collection?.purchaseOrders ?? [];
  const approvedQuotations = collection?.approvedQuotations ?? [];

  return (
    <>
      <header>
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          {isProcurement ? "Purchase Orders" : "My Purchase Orders"}
        </h1>
        <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
          {isProcurement
            ? "Generate and review purchase orders from approved quotations."
            : "Review purchase orders issued to your vendor profile."}
        </p>
      </header>

      {isLoading ? (
        <p className="mt-7 text-sm text-[#c7c7c7]" role="status">Loading purchase orders&hellip;</p>
      ) : loadError ? (
        <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">
          {loadError}
        </p>
      ) : (
        <>
          {generationError ? <p className="mt-5 rounded-[5px] border border-[#b86d6d] bg-[#2a1717] p-3 text-sm text-[#f2bbbb]" role="alert">{generationError}</p> : null}
          {generationSuccess ? <p className="mt-5 rounded-[5px] border border-[#638d67] bg-[#142418] p-3 text-sm text-[#c8e9ca]" role="status">{generationSuccess}</p> : null}

          <section aria-labelledby="purchase-orders-heading" className="mt-7">
            <h2 className="text-lg font-medium" id="purchase-orders-heading">Generated Purchase Orders</h2>
            {purchaseOrders.length === 0 ? (
              <div className="mt-4 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
                No purchase orders have been generated yet.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                    <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                      <tr>
                        <th className="px-4 py-3 font-medium">PO</th>
                        <th className="px-4 py-3 font-medium">RFQ</th>
                        {isProcurement ? <th className="px-4 py-3 font-medium">Vendor</th> : null}
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                        <th className="px-4 py-3 font-medium">Generated</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((purchaseOrder) => (
                        <tr className="border-t border-[#454545]" key={purchaseOrder.id}>
                          <td className="px-4 py-3 font-mono text-xs text-[#efefef]">{purchaseOrder.poNumber}</td>
                          <td className="px-4 py-3"><p className="font-mono text-xs text-[#efefef]">{purchaseOrder.rfqNumber}</p><p className="mt-1 text-[#d6d6d6]">{purchaseOrder.rfqTitle}</p></td>
                          {isProcurement ? <td className="px-4 py-3 text-[#d6d6d6]">{purchaseOrder.vendorName}</td> : null}
                          <td className="px-4 py-3 text-[#d6d6d6]">{label(purchaseOrder.status)}</td>
                          <td className="px-4 py-3 text-[#d6d6d6]">{purchaseOrder.currency} {purchaseOrder.totalAmount}</td>
                          <td className="px-4 py-3 text-[#d6d6d6]">{formatDate(purchaseOrder.generatedAt)}</td>
                          <td className="px-4 py-3"><Link className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525]" href={`/purchase-orders/${purchaseOrder.id}`}>View</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {isProcurement ? (
            <section aria-labelledby="approved-quotations-heading" className="mt-9">
              <h2 className="text-lg font-medium" id="approved-quotations-heading">Approved Quotations Ready for PO</h2>
              <p className="mt-1 text-sm text-[#c7c7c7]">Only approved quotations without an existing purchase order are shown.</p>
              {approvedQuotations.length === 0 ? (
                <div className="mt-4 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
                  No approved quotations are awaiting a purchase order.
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
                      <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                        <tr>
                          <th className="px-4 py-3 font-medium">RFQ</th>
                          <th className="px-4 py-3 font-medium">Vendor</th>
                          <th className="px-4 py-3 font-medium">Approved</th>
                          <th className="px-4 py-3 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {approvedQuotations.map((quotation) => {
                          const isGenerating = generatingApprovalId === quotation.approvalRequestId;
                          return (
                            <tr className="border-t border-[#454545]" key={quotation.approvalRequestId}>
                              <td className="px-4 py-3"><p className="font-mono text-xs text-[#efefef]">{quotation.rfqNumber}</p><p className="mt-1 text-[#d6d6d6]">{quotation.rfqTitle}</p></td>
                              <td className="px-4 py-3 text-[#d6d6d6]">{quotation.vendorName}</td>
                              <td className="px-4 py-3 text-[#d6d6d6]">{quotation.approvedAt ? formatDate(quotation.approvedAt) : "Approval time unavailable"}</td>
                              <td className="px-4 py-3"><button className="h-8 rounded-[4px] border border-[#72a877] bg-[#214829] px-3 text-xs text-[#d8f3d9] disabled:cursor-not-allowed disabled:opacity-60" disabled={generatingApprovalId !== null} onClick={() => generatePurchaseOrder(quotation.approvalRequestId)} type="button">{isGenerating ? "Generating&hellip;" : "Generate PO"}</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
