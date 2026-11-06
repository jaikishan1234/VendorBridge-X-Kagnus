"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InvoiceListItem = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  grandTotal: string;
  issuedAt: string;
  purchaseOrderNumber: string;
  vendorName: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

async function requestInvoices(): Promise<InvoiceListItem[]> {
  const response = await fetch("/api/invoices");
  const payload = await response.json().catch(() => null) as {
    invoices?: InvoiceListItem[];
    message?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.message ?? "Unable to load invoices.");
  return payload?.invoices ?? [];
}

export function InvoicesPanel({ isProcurement }: { isProcurement: boolean }) {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void requestInvoices()
      .then((nextInvoices) => {
        if (isCurrent) setInvoices(nextInvoices);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load invoices. Please try again.");
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <>
      <header>
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          {isProcurement ? "Invoices" : "My Invoices"}
        </h1>
        <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
          {isProcurement
            ? "Review invoices generated from purchase orders."
            : "Review invoices issued to your vendor profile."}
        </p>
      </header>

      {isLoading ? (
        <p className="mt-7 text-sm text-[#c7c7c7]" role="status">Loading invoices&hellip;</p>
      ) : error ? (
        <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">
          {error}
        </p>
      ) : invoices.length === 0 ? (
        <div className="mt-7 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
          No invoices have been generated yet.
        </div>
      ) : (
        <section aria-labelledby="invoices-heading" className="mt-7">
          <h2 className="text-lg font-medium" id="invoices-heading">Generated Invoices</h2>
          <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[50rem] border-collapse text-left text-sm">
                <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Invoice</th>
                    {isProcurement ? <th className="px-4 py-3 font-medium">Vendor</th> : null}
                    <th className="px-4 py-3 font-medium">Source PO</th>
                    <th className="px-4 py-3 font-medium">Issued</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Grand total</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr className="border-t border-[#454545]" key={invoice.id}>
                      <td className="px-4 py-3 font-mono text-xs text-[#efefef]">{invoice.invoiceNumber}</td>
                      {isProcurement ? <td className="px-4 py-3 text-[#d6d6d6]">{invoice.vendorName}</td> : null}
                      <td className="px-4 py-3 font-mono text-xs text-[#d6d6d6]">{invoice.purchaseOrderNumber}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{formatDate(invoice.issuedAt)}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{label(invoice.status)}</td>
                      <td className="px-4 py-3 text-[#efefef]">{invoice.currency} {invoice.grandTotal}</td>
                      <td className="px-4 py-3"><Link className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525]" href={`/invoices/${invoice.id}`}>View</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
