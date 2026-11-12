"use client";

import { useEffect, useState } from "react";

type CurrencyValue = { currency: string; value: string; documentCount: number };
type TrendValue = CurrencyValue & { month: string };
type VendorRow = {
  vendorId: string;
  vendorName: string;
  rfqParticipationCount: number;
  submittedQuotationCount: number;
  awardedPurchaseOrderCount: number;
  purchaseOrderValueByCurrency: CurrencyValue[];
};
type ReportData = {
  overview: {
    totalRfqs: number;
    openRfqs: number;
    activeVendors: number;
    submittedQuotations: number;
    generatedPurchaseOrders: number;
    generatedInvoices: number;
  };
  purchaseOrderValueByCurrency: CurrencyValue[];
  invoiceValueByCurrency: CurrencyValue[];
  monthlyProcurementTrend: TrendValue[];
  vendorAnalytics: VendorRow[];
};

function currencyValue({ currency, value }: CurrencyValue) {
  return `${currency} ${value}`;
}

function CurrencySummary({ title, values }: { title: string; values: CurrencyValue[] }) {
  return (
    <section className="rounded-[6px] border border-[#777777] bg-[#151515] p-4" aria-label={title}>
      <h2 className="text-base font-medium text-[#efefef]">{title}</h2>
      <p className="mt-1 text-xs text-[#a8a8a8]">Generated document values; not payment totals.</p>
      {values.length === 0 ? <p className="mt-5 text-sm text-[#c7c7c7]">No generated documents yet.</p> : (
        <ul className="mt-4 space-y-2">{values.map((value) => <li className="flex items-center justify-between text-sm" key={value.currency}><span className="text-[#d6d6d6]">{value.currency} · {value.documentCount} document{value.documentCount === 1 ? "" : "s"}</span><span className="font-medium text-[#efefef]">{currencyValue(value)}</span></li>)}</ul>
      )}
    </section>
  );
}

function TrendChart({ trends }: { trends: TrendValue[] }) {
  const currencies = [...new Set(trends.map((trend) => trend.currency))];
  if (currencies.length === 0) return <p className="mt-4 text-sm text-[#c7c7c7]">No generated purchase orders yet.</p>;
  return <div className="mt-5 grid gap-5 lg:grid-cols-2">{currencies.map((currency) => {
    const values = trends.filter((trend) => trend.currency === currency);
    const maximum = Math.max(...values.map((trend) => Number(trend.value)));
    return <section key={currency}><h3 className="text-sm font-medium text-[#d6d6d6]">{currency}</h3><div className="mt-3 flex min-h-40 items-end gap-2 border-b border-[#777777] pb-2">{values.map((trend) => <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={`${trend.month}-${trend.currency}`} title={`${trend.month}: ${currencyValue(trend)}`}><span className="text-center text-[10px] text-[#c7c7c7]">{trend.value}</span><div className="w-full rounded-t bg-[#087020]" style={{ height: `${maximum > 0 ? Math.max((Number(trend.value) / maximum) * 112, 4) : 4}px` }} /><span className="text-[10px] text-[#a8a8a8]">{trend.month.slice(5)}</span></div>)}</div></section>;
  })}</div>;
}

export function ReportsPanel() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCurrent = true;
    void fetch("/api/reports")
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { report?: ReportData; message?: string } | null;
        if (!response.ok || !payload?.report) throw new Error(payload?.message ?? "Unable to load reports.");
        if (isCurrent) setReport(payload.report);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load reports.");
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, []);

  if (isLoading) return <p className="mt-7 text-sm text-[#c7c7c7]" role="status">Loading reports&hellip;</p>;
  if (error) return <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">{error}</p>;
  if (!report) return null;

  const metrics = [
    ["Total RFQs", report.overview.totalRfqs], ["Open RFQs", report.overview.openRfqs],
    ["Active Vendors", report.overview.activeVendors], ["Submitted Quotations", report.overview.submittedQuotations],
    ["Generated Purchase Orders", report.overview.generatedPurchaseOrders], ["Generated Invoices", report.overview.generatedInvoices],
  ];

  return <>
    <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <article className="rounded-[6px] border border-[#777777] bg-[#151515] p-4" key={String(label)}><p className="text-2xl font-medium text-[#efefef]">{value}</p><h2 className="mt-2 text-sm text-[#c7c7c7]">{label}</h2></article>)}</div>
    <section className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-[6px] border border-[#777777] bg-[#151515] p-4"><div><h2 className="text-base font-medium text-[#efefef]">Purchase Order Report</h2><p className="mt-1 text-sm text-[#c7c7c7]">Export authorized generated purchase-order records.</p></div><a className="inline-flex h-9 items-center rounded-[4px] border border-[#8a8a8a] px-4 text-sm text-[#efefef] hover:bg-[#252525]" href="/api/reports/purchase-orders.csv">Download CSV</a></section>
    <div className="mt-8 grid gap-5 lg:grid-cols-2"><CurrencySummary title="Generated Purchase Order Value" values={report.purchaseOrderValueByCurrency} /><CurrencySummary title="Generated Invoice Value" values={report.invoiceValueByCurrency} /></div>
    <section className="mt-8 rounded-[6px] border border-[#777777] bg-[#151515] p-4"><h2 className="text-base font-medium text-[#efefef]">Monthly Generated Purchase Order Value</h2><p className="mt-1 text-xs text-[#a8a8a8]">Grouped by month and currency; currencies are never combined.</p><TrendChart trends={report.monthlyProcurementTrend} /></section>
    <section className="mt-8"><h2 className="text-lg font-medium text-[#efefef]">Vendor Procurement Analytics</h2><p className="mt-1 text-sm text-[#c7c7c7]">Participation, submitted quotations, awards, and generated purchase-order value only.</p>{report.vendorAnalytics.length === 0 ? <div className="mt-4 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">No vendor procurement activity yet.</div> : <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]"><div className="overflow-x-auto"><table className="w-full min-w-[56rem] border-collapse text-left text-sm"><thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]"><tr><th className="px-4 py-3 font-medium">Vendor</th><th className="px-4 py-3 font-medium">RFQ participation</th><th className="px-4 py-3 font-medium">Submitted quotations</th><th className="px-4 py-3 font-medium">PO awards</th><th className="px-4 py-3 font-medium">Generated PO value</th></tr></thead><tbody>{report.vendorAnalytics.map((vendor) => <tr className="border-t border-[#454545]" key={vendor.vendorId}><td className="px-4 py-3 text-[#efefef]">{vendor.vendorName}</td><td className="px-4 py-3 text-[#d6d6d6]">{vendor.rfqParticipationCount}</td><td className="px-4 py-3 text-[#d6d6d6]">{vendor.submittedQuotationCount}</td><td className="px-4 py-3 text-[#d6d6d6]">{vendor.awardedPurchaseOrderCount}</td><td className="px-4 py-3 text-[#d6d6d6]">{vendor.purchaseOrderValueByCurrency.length ? vendor.purchaseOrderValueByCurrency.map(currencyValue).join(" · ") : "—"}</td></tr>)}</tbody></table></div></div>}</section>
  </>;
}
