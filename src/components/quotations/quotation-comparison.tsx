"use client";

import { useMemo, useState } from "react";
import type { ComparedQuotation, QuotationComparison } from "@/lib/quotation-comparison";

type SortMode = "lowest" | "vendor" | "latest";

function formatSubmittedAt(submittedAt: Date | null) {
  if (!submittedAt) return "Submitted time unavailable";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(submittedAt));
}

export function filterAndSortQuotations(
  quotations: ComparedQuotation[],
  vendorFilter: string,
  sort: SortMode,
) {
  return quotations
    .filter((quotation) =>
      quotation.vendorName.toLowerCase().includes(vendorFilter.trim().toLowerCase()),
    )
    .sort((left, right) => {
    if (sort === "vendor") return left.vendorName.localeCompare(right.vendorName);
    if (sort === "latest") {
      return (right.submittedAt?.getTime() ?? 0) - (left.submittedAt?.getTime() ?? 0);
    }

    if (left.totalMinor === null) return 1;
    if (right.totalMinor === null) return -1;
    const totalDifference = BigInt(left.totalMinor) - BigInt(right.totalMinor);
    return totalDifference < BigInt(0) ? -1 : totalDifference > BigInt(0) ? 1 : 0;
    });
}

export function QuotationComparisonPanel({ comparison }: { comparison: QuotationComparison }) {
  const [vendorFilter, setVendorFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("lowest");
  const [selectedQuotationId, setSelectedQuotationId] = useState<string | null>(null);

  const quotations = useMemo(
    () => filterAndSortQuotations(comparison.quotations, vendorFilter, sort),
    [comparison.quotations, sort, vendorFilter],
  );

  return (
    <section aria-labelledby="submitted-quotations-heading" className="mt-7">
      <div className="flex flex-col gap-4 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div>
          <h2 className="text-lg font-medium" id="submitted-quotations-heading">Submitted Quotations</h2>
          <p className="mt-1 text-sm text-[#c7c7c7]">
            {comparison.quotations.length} submitted {comparison.quotations.length === 1 ? "quotation" : "quotations"} · {comparison.rfq.currency}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[#c7c7c7]">
            Filter vendors
            <input
              className="mt-1 block h-9 w-full rounded-[4px] border border-[#747474] bg-[#181818] px-3 text-sm text-[#ededed] outline-none placeholder:text-[#898989] focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25"
              onChange={(event) => setVendorFilter(event.target.value)}
              placeholder="Vendor name"
              value={vendorFilter}
            />
          </label>
          <label className="text-xs text-[#c7c7c7]">
            Sort by
            <select
              className="mt-1 block h-9 w-full rounded-[4px] border border-[#747474] bg-[#181818] px-3 text-sm text-[#ededed] outline-none focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25"
              onChange={(event) => setSort(event.target.value as SortMode)}
              value={sort}
            >
              <option value="lowest">Lowest comparable total</option>
              <option value="vendor">Vendor name</option>
              <option value="latest">Most recently submitted</option>
            </select>
          </label>
        </div>
      </div>

      {comparison.quotations.length === 0 ? (
        <div className="mt-4 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
          No submitted quotations are available for this RFQ yet.
        </div>
      ) : quotations.length === 0 ? (
        <div className="mt-4 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
          No submitted quotations match that vendor filter.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {quotations.map((quotation) => {
            const pricesByLineItemId = new Map(
              quotation.lineItems.map((lineItem) => [lineItem.rfqLineItemId, lineItem.unitPrice]),
            );
            const isSelected = selectedQuotationId === quotation.id;

            return (
              <article
                className={`min-w-0 rounded-[6px] border p-4 ${quotation.isLowest ? "border-[#72a877] bg-[#142418]" : "border-[#777777] bg-[#151515]"}`}
                key={quotation.id}
              >
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-[#efefef]">{quotation.vendorName}</h3>
                    <p className="mt-1 text-xs text-[#b7b7b7]">{formatSubmittedAt(quotation.submittedAt)}</p>
                  </div>
                  {quotation.isLowest ? <span className="rounded border border-[#72a877] px-2 py-1 text-xs text-[#c8e9ca]">Lowest total</span> : null}
                </header>

                <div className="mt-4 overflow-x-auto rounded-[4px] border border-[#5e5e5e]">
                  <table className="w-full min-w-[28rem] border-collapse text-left text-xs">
                    <thead className="border-b border-[#5e5e5e] text-[#bdbdbd]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Line item</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Unit price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.lineItems.map((lineItem) => (
                        <tr className="border-t border-[#454545]" key={lineItem.id}>
                          <td className="px-3 py-2 text-[#efefef]">{lineItem.description}</td>
                          <td className="px-3 py-2 text-[#d6d6d6]">{lineItem.quantity} {lineItem.unit}</td>
                          <td className="px-3 py-2 text-[#d6d6d6]">
                            {pricesByLineItemId.get(lineItem.id) ?? "Not quoted"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-[#a8a8a8]">Comparable total</dt>
                    <dd className="mt-1 font-medium text-[#efefef]">
                      {quotation.isComparable && quotation.total ? `${comparison.rfq.currency} ${quotation.total}` : "Incomplete quotation"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#a8a8a8]">Delivery timeline</dt>
                    <dd className="mt-1 text-[#d6d6d6]">{quotation.deliveryTimeline || "Not provided"}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-[#a8a8a8]">Notes</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-[#d6d6d6]">{quotation.notes || "No notes provided"}</dd>
                  </div>
                </dl>

                <div className="mt-4 border-t border-[#454545] pt-4">
                  <button
                    aria-pressed={isSelected}
                    className={`h-8 rounded-[4px] border px-3 text-xs transition-colors ${isSelected ? "border-[#72a877] bg-[#214829] text-[#d8f3d9]" : "border-[#777777] text-[#e8e8e8] hover:bg-[#252525]"}`}
                    onClick={() => setSelectedQuotationId((current) => current === quotation.id ? null : quotation.id)}
                    type="button"
                  >
                    {isSelected ? "Selected for Week 3 review" : "Select for Week 3 review"}
                  </button>
                  {isSelected ? <p className="mt-2 text-xs text-[#b7b7b7]">This selection is session-only. Week 3 approval persistence is not available yet.</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
