"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PurchaseOrderDetail = {
  id: string;
  poNumber: string;
  quotationId: string;
  rfqNumber: string;
  rfqTitle: string;
  vendorName: string;
  status: "GENERATED";
  currency: string;
  totalAmount: string;
  generatedAt: string;
  lineItems: Array<{
    id: string;
    lineNumber: number;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    lineTotal: string;
  }>;
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

export function PurchaseOrderDetailPanel({ poId }: { poId: string }) {
  const [purchaseOrder, setPurchaseOrder] = useState<PurchaseOrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPurchaseOrder() {
      try {
        const response = await fetch(`/api/purchase-orders/${poId}`);
        const payload = await response.json().catch(() => null) as { message?: string; purchaseOrder?: PurchaseOrderDetail } | null;
        if (!response.ok || !payload?.purchaseOrder) {
          setError(payload?.message ?? "Unable to load purchase order.");
          return;
        }

        setPurchaseOrder(payload.purchaseOrder);
      } catch {
        setError("Unable to load purchase order. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadPurchaseOrder();
  }, [poId]);

  if (isLoading) {
    return <p className="text-sm text-[#c7c7c7]" role="status">Loading purchase order&hellip;</p>;
  }

  if (error || !purchaseOrder) {
    return <p className="rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">{error ?? "Purchase order not found."}</p>;
  }

  return (
    <>
      <Link className="text-sm text-[#c7c7c7] underline-offset-4 hover:text-[#efefef] hover:underline" href="/purchase-orders">Back to Purchase Orders</Link>
      <header className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
        <p className="font-mono text-xs text-[#a8a8a8]">{purchaseOrder.poNumber}</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Purchase Order</h1>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs text-[#a8a8a8]">Status</dt><dd className="mt-1 text-[#efefef]">{label(purchaseOrder.status)}</dd></div>
          <div><dt className="text-xs text-[#a8a8a8]">Generated</dt><dd className="mt-1 text-[#efefef]">{formatDate(purchaseOrder.generatedAt)}</dd></div>
          <div><dt className="text-xs text-[#a8a8a8]">RFQ</dt><dd className="mt-1 text-[#efefef]"><span className="font-mono text-xs">{purchaseOrder.rfqNumber}</span><span className="block text-[#d6d6d6]">{purchaseOrder.rfqTitle}</span></dd></div>
          <div><dt className="text-xs text-[#a8a8a8]">Vendor</dt><dd className="mt-1 text-[#efefef]">{purchaseOrder.vendorName}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-[#a8a8a8]">Source quotation</dt><dd className="mt-1 break-all font-mono text-xs text-[#d6d6d6]">{purchaseOrder.quotationId}</dd></div>
          <div><dt className="text-xs text-[#a8a8a8]">Currency</dt><dd className="mt-1 text-[#efefef]">{purchaseOrder.currency}</dd></div>
        </dl>
      </header>

      <section aria-labelledby="po-line-items-heading" className="mt-8">
        <h2 className="text-lg font-medium" id="po-line-items-heading">Line Items</h2>
        <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
              <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                <tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Quantity</th><th className="px-4 py-3 font-medium">Unit price</th><th className="px-4 py-3 font-medium">Line total</th></tr>
              </thead>
              <tbody>
                {purchaseOrder.lineItems.map((lineItem) => (
                  <tr className="border-t border-[#454545]" key={lineItem.id}>
                    <td className="px-4 py-3 text-[#d6d6d6]">{lineItem.lineNumber}</td><td className="px-4 py-3 text-[#efefef]">{lineItem.description}</td><td className="px-4 py-3 text-[#d6d6d6]">{lineItem.quantity} {lineItem.unit}</td><td className="px-4 py-3 text-[#d6d6d6]">{purchaseOrder.currency} {lineItem.unitPrice}</td><td className="px-4 py-3 text-[#efefef]">{purchaseOrder.currency} {lineItem.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[#8a8a8a] bg-[#151515]"><tr><th className="px-4 py-3 text-right" colSpan={4}>Grand total</th><td className="px-4 py-3 font-medium text-[#efefef]">{purchaseOrder.currency} {purchaseOrder.totalAmount}</td></tr></tfoot>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
