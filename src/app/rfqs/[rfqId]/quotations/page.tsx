import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { QuotationComparisonPanel } from "@/components/quotations/quotation-comparison";
import { requireRole } from "@/lib/authorization";
import { getQuotationComparison } from "@/lib/quotation-comparison";

type QuotationComparisonPageProps = {
  params: Promise<{ rfqId: string }>;
};

function formatDeadline(deadline: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(deadline);
}

export default async function QuotationComparisonPage({ params }: QuotationComparisonPageProps) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const { rfqId } = await params;
  if (!z.string().uuid().safeParse(rfqId).success) notFound();

  let comparison: Awaited<ReturnType<typeof getQuotationComparison>> = null;
  let comparisonLoadFailed = false;
  try {
    comparison = await getQuotationComparison(rfqId);
  } catch (error) {
    console.error("Quotation comparison page error:", error);
    comparisonLoadFailed = true;
  }

  if (comparisonLoadFailed) {
    return (
      <AppShell activeItem="Quotations" user={authorization.user}>
        <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Quotation Comparison</h1>
          <p className="mt-5 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">
            Unable to load this quotation comparison. Please try again.
          </p>
        </section>
      </AppShell>
    );
  }

  if (!comparison) notFound();

  return (
    <AppShell activeItem="Quotations" user={authorization.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <Link className="text-sm text-[#c7c7c7] underline-offset-4 hover:text-[#efefef] hover:underline" href="/quotations">
          Back to Quotations
        </Link>
        <header className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
          <p className="font-mono text-xs text-[#a8a8a8]">{comparison.rfq.rfqNumber}</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Quotation Comparison</h1>
          <p className="mt-2 text-sm text-[#efefef]">{comparison.rfq.title}</p>
          <p className="mt-1 text-sm text-[#c7c7c7]">{comparison.rfq.category} · Deadline: {formatDeadline(comparison.rfq.deadline)} · {comparison.rfq.currency}</p>
        </header>
        <QuotationComparisonPanel comparison={comparison} />
      </section>
    </AppShell>
  );
}
