import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { quotations, rfqs } from "@/db/schema";
import { requireRole } from "@/lib/authorization";

export default async function QuotationsPage() {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const quotationRfqRows = await db
    .select({
      id: rfqs.id,
      rfqNumber: rfqs.rfqNumber,
      title: rfqs.title,
      category: rfqs.category,
      currency: rfqs.currency,
      submittedQuotationCount: count(quotations.id),
    })
    .from(rfqs)
    .innerJoin(quotations, eq(quotations.rfqId, rfqs.id))
    .where(eq(quotations.status, "SUBMITTED"))
    .groupBy(rfqs.id, rfqs.rfqNumber, rfqs.title, rfqs.category, rfqs.currency)
    .orderBy(desc(rfqs.createdAt));

  return (
    <AppShell activeItem="Quotations" user={authorization.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Quotations</h1>
          <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
            Review submitted vendor quotations and compare them by RFQ.
          </p>
        </header>

        {quotationRfqRows.length === 0 ? (
          <div className="mt-7 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
            No vendor quotations have been submitted yet.
          </div>
        ) : (
          <div className="mt-7 overflow-hidden rounded-[6px] border border-[#777777]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse text-left text-sm">
                <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                  <tr>
                    <th className="px-4 py-3 font-medium">RFQ</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationRfqRows.map((rfq) => (
                    <tr className="border-t border-[#454545]" key={rfq.id}>
                      <td className="px-4 py-3 font-mono text-xs text-[#efefef]">{rfq.rfqNumber}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{rfq.title}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{rfq.category}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{rfq.submittedQuotationCount}</td>
                      <td className="px-4 py-3">
                        <Link className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href={`/rfqs/${rfq.id}/quotations`}>
                          Compare
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
