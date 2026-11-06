"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  purchaseOrderNumber: string;
  status: string;
  currency: string;
  subtotalAmount: string;
  gstRate: string;
  taxAmount: string;
  grandTotal: string;
  issuedAt: string;
  vendor: { name: string; contactName: string; email: string; phoneNumber: string; gstNumber: string | null };
  lineItems: Array<{
    id: string;
    lineNumber: number;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  emailDeliveries?: Array<{ id: string; status: "SENT" | "FAILED"; attemptedAt: string }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function InvoiceActions({
  invoiceId,
  isProcurement,
  isSending,
  hasSentEmail,
  sendSuccess,
  onSend,
}: {
  invoiceId: string;
  isProcurement: boolean;
  isSending: boolean;
  hasSentEmail: boolean;
  sendSuccess: boolean;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <a className="inline-flex h-9 items-center rounded-[4px] border border-[#8a8a8a] px-4 text-sm text-[#efefef] hover:bg-[#252525]" href={`/api/invoices/${invoiceId}/pdf`}>Download PDF</a>
      {isProcurement ? <button className="h-9 rounded-[4px] border border-[#72a877] bg-[#214829] px-4 text-sm text-[#d8f3d9] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSending || hasSentEmail || sendSuccess} onClick={onSend} type="button">{isSending ? "Sending&hellip;" : hasSentEmail || sendSuccess ? "Invoice sent" : "Send Invoice"}</button> : null}
    </div>
  );
}

export function InvoiceEmailFeedback({ error, success }: { error: string | null; success: string | null }) {
  return <>{error ? <p className="mt-4 rounded-[5px] border border-[#b86d6d] bg-[#2a1717] p-3 text-sm text-[#f2bbbb]" role="alert">{error}</p> : null}{success ? <p className="mt-4 rounded-[5px] border border-[#638d67] bg-[#142418] p-3 text-sm text-[#c8e9ca]" role="status">{success}</p> : null}</>;
}

export function InvoiceDetailPanel({ invoiceId, isProcurement }: { invoiceId: string; isProcurement: boolean }) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    async function loadInvoice() {
      try {
        const response = await fetch(`/api/invoices/${invoiceId}`);
        const payload = await response.json().catch(() => null) as { invoice?: InvoiceDetail; message?: string } | null;
        if (!response.ok || !payload?.invoice) {
          if (isCurrent) setError(payload?.message ?? "Unable to load invoice.");
          return;
        }
        if (isCurrent) setInvoice(payload.invoice);
      } catch {
        if (isCurrent) setError("Unable to load invoice. Please try again.");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void loadInvoice();
    return () => {
      isCurrent = false;
    };
  }, [invoiceId]);

  async function sendInvoice() {
    if (isSending || sendSuccess || !invoice) return;
    setIsSending(true);
    setSendError(null);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/email`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) {
        setSendError(payload?.message ?? (response.status === 409 ? "This invoice email has already been sent." : "Unable to send the invoice email."));
        return;
      }
      setSendSuccess(payload?.message ?? "Invoice email submitted to SMTP.");
      setInvoice((current) => current ? {
        ...current,
        emailDeliveries: [{ id: "new-delivery", status: "SENT", attemptedAt: new Date().toISOString() }, ...(current.emailDeliveries ?? [])],
      } : current);
    } catch {
      setSendError("Unable to send the invoice email. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading) return <p className="text-sm text-[#c7c7c7]" role="status">Loading invoice&hellip;</p>;
  if (error || !invoice) return <p className="rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">{error ?? "Invoice not found."}</p>;

  const hasSentEmail = Boolean(invoice.emailDeliveries?.some((delivery) => delivery.status === "SENT"));

  return (
    <>
      <Link className="text-sm text-[#c7c7c7] underline-offset-4 hover:text-[#efefef] hover:underline" href="/invoices">Back to Invoices</Link>
      <header className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="font-mono text-xs text-[#a8a8a8]">{invoice.invoiceNumber}</p><h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Invoice</h1></div>
          <InvoiceActions hasSentEmail={hasSentEmail} invoiceId={invoice.id} isProcurement={isProcurement} isSending={isSending} onSend={() => void sendInvoice()} sendSuccess={Boolean(sendSuccess)} />
        </div>
        <InvoiceEmailFeedback error={sendError} success={sendSuccess} />
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-xs text-[#a8a8a8]">Status</dt><dd className="mt-1 text-[#efefef]">{label(invoice.status)}</dd></div><div><dt className="text-xs text-[#a8a8a8]">Issued</dt><dd className="mt-1 text-[#efefef]">{formatDate(invoice.issuedAt)}</dd></div><div><dt className="text-xs text-[#a8a8a8]">Source PO</dt><dd className="mt-1 font-mono text-xs text-[#efefef]">{invoice.purchaseOrderNumber}</dd></div><div><dt className="text-xs text-[#a8a8a8]">Currency</dt><dd className="mt-1 text-[#efefef]">{invoice.currency}</dd></div></dl>
      </header>

      <section aria-labelledby="invoice-vendor-heading" className="mt-8"><h2 className="text-lg font-medium" id="invoice-vendor-heading">Vendor</h2><div className="mt-4 rounded-[6px] border border-[#777777] bg-[#151515] p-4 text-sm text-[#d6d6d6]"><p className="font-medium text-[#efefef]">{invoice.vendor.name}</p><p className="mt-1">{invoice.vendor.contactName}</p><p>{invoice.vendor.email}</p><p>{invoice.vendor.phoneNumber}</p>{invoice.vendor.gstNumber ? <p>GSTIN: {invoice.vendor.gstNumber}</p> : null}</div></section>

      <section aria-labelledby="invoice-line-items-heading" className="mt-8"><h2 className="text-lg font-medium" id="invoice-line-items-heading">Line Items</h2><div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]"><div className="overflow-x-auto"><table className="w-full min-w-[46rem] border-collapse text-left text-sm"><thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]"><tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Description</th><th className="px-4 py-3 font-medium">Quantity</th><th className="px-4 py-3 font-medium">Unit price</th><th className="px-4 py-3 font-medium">Line total</th></tr></thead><tbody>{invoice.lineItems.map((lineItem) => <tr className="border-t border-[#454545]" key={lineItem.id}><td className="px-4 py-3 text-[#d6d6d6]">{lineItem.lineNumber}</td><td className="px-4 py-3 text-[#efefef]">{lineItem.description}</td><td className="px-4 py-3 text-[#d6d6d6]">{lineItem.quantity} {lineItem.unit}</td><td className="px-4 py-3 text-[#d6d6d6]">{invoice.currency} {lineItem.unitPrice}</td><td className="px-4 py-3 text-[#efefef]">{invoice.currency} {lineItem.lineTotal}</td></tr>)}</tbody><tfoot className="border-t border-[#8a8a8a] bg-[#151515]"><tr><th className="px-4 py-3 text-right" colSpan={4}>Subtotal</th><td className="px-4 py-3 text-[#efefef]">{invoice.currency} {invoice.subtotalAmount}</td></tr><tr><th className="px-4 py-3 text-right" colSpan={4}>GST ({invoice.gstRate}%)</th><td className="px-4 py-3 text-[#efefef]">{invoice.currency} {invoice.taxAmount}</td></tr><tr><th className="px-4 py-3 text-right" colSpan={4}>Grand total</th><td className="px-4 py-3 font-medium text-[#efefef]">{invoice.currency} {invoice.grandTotal}</td></tr></tfoot></table></div></div></section>

      {isProcurement ? <section aria-labelledby="invoice-email-history-heading" className="mt-8"><h2 className="text-lg font-medium" id="invoice-email-history-heading">Email Delivery History</h2>{invoice.emailDeliveries?.length ? <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]"><table className="w-full border-collapse text-left text-sm"><thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]"><tr><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Attempted</th></tr></thead><tbody>{invoice.emailDeliveries.map((delivery) => <tr className="border-t border-[#454545]" key={delivery.id}><td className="px-4 py-3 text-[#d6d6d6]">{label(delivery.status)}</td><td className="px-4 py-3 text-[#d6d6d6]">{formatDate(delivery.attemptedAt)}</td></tr>)}</tbody></table></div> : <p className="mt-4 rounded-[6px] border border-dashed border-[#777777] p-4 text-sm text-[#c7c7c7]">No email delivery attempts have been recorded.</p>}</section> : null}
    </>
  );
}
