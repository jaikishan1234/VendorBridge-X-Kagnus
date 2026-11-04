import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ApprovalDecisionForm } from "@/components/approvals/approval-decision-form";
import { getApprovalDetail } from "@/lib/approvals";
import { requireRole } from "@/lib/authorization";

type ApprovalPageProps = { params: Promise<{ approvalId: string }> };

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function label(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export default async function ApprovalDetailPage({ params }: ApprovalPageProps) {
  const authorization = await requireRole(["MANAGER"]);
  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const { approvalId } = await params;
  if (!z.string().uuid().safeParse(approvalId).success) notFound();

  let approval: Awaited<ReturnType<typeof getApprovalDetail>> = null;
  let loadFailed = false;
  try {
    approval = await getApprovalDetail(approvalId);
  } catch (error) {
    console.error("Approval detail page error:", error);
    loadFailed = true;
  }
  if (loadFailed) {
    return (
      <AppShell activeItem="Approvals" user={authorization.user}>
        <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Approval</h1>
          <p className="mt-5 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">Unable to load this approval. Please try again.</p>
        </section>
      </AppShell>
    );
  }
  if (!approval) notFound();

  return (
    <AppShell activeItem="Approvals" user={authorization.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <Link className="text-sm text-[#c7c7c7] underline-offset-4 hover:text-[#efefef] hover:underline" href="/approvals">Back to Approvals</Link>
        <header className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
          <p className="font-mono text-xs text-[#a8a8a8]">{approval.rfqNumber}</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">{approval.rfqTitle}</h1>
          <p className="mt-2 text-sm text-[#c7c7c7]">Selected vendor: {approval.vendorName} · {approval.vendorEmail}</p>
          <p className="mt-2 text-sm text-[#c8e9ca]">Status: {label(approval.status)}</p>
        </header>

        <section aria-labelledby="selected-quotation-heading" className="mt-8 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
          <h2 className="text-lg font-medium" id="selected-quotation-heading">Selected Quotation</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-[#a8a8a8]">Comparable total</dt><dd className="mt-1 text-[#efefef]">{approval.currency} {approval.total}</dd></div>
            <div><dt className="text-xs text-[#a8a8a8]">Selected</dt><dd className="mt-1 text-[#efefef]">{formatDate(approval.selectedAt)} by {approval.selectedByUsername}</dd></div>
            <div><dt className="text-xs text-[#a8a8a8]">Delivery timeline</dt><dd className="mt-1 text-[#efefef]">{approval.deliveryTimeline || "Not provided"}</dd></div>
            <div><dt className="text-xs text-[#a8a8a8]">Vendor notes</dt><dd className="mt-1 whitespace-pre-wrap text-[#efefef]">{approval.notes || "No notes provided"}</dd></div>
          </dl>
          <div className="mt-5 overflow-x-auto rounded-[4px] border border-[#5e5e5e]">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm"><thead className="border-b border-[#5e5e5e] text-xs text-[#bdbdbd]"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Line item</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Unit price</th></tr></thead><tbody>{approval.lineItems.map((lineItem) => <tr className="border-t border-[#454545]" key={lineItem.id}><td className="px-3 py-2">{lineItem.lineNumber}</td><td className="px-3 py-2">{lineItem.description}</td><td className="px-3 py-2">{lineItem.quantity} {lineItem.unit}</td><td className="px-3 py-2">{lineItem.unitPrice}</td></tr>)}</tbody></table>
          </div>
        </section>

        {approval.status === "PENDING" ? <ApprovalDecisionForm approvalId={approval.id} /> : null}

        <section aria-labelledby="approval-history-heading" className="mt-8">
          <h2 className="text-lg font-medium" id="approval-history-heading">Approval Timeline</h2>
          <ol className="mt-4 space-y-3 border-l border-[#777777] pl-5">
            {approval.history.map((event) => (
              <li className="relative rounded-[5px] border border-[#777777] bg-[#151515] p-4" key={event.id}>
                <span aria-hidden="true" className="absolute -left-[1.75rem] top-5 size-3 rounded-full border border-[#b7b7b7] bg-[#111111]" />
                <p className="text-sm font-medium text-[#efefef]">{label(event.action)} · {event.actorUsername}</p>
                <p className="mt-1 text-xs text-[#b7b7b7]">{formatDate(event.occurredAt)}</p>
                {event.remarks ? <p className="mt-3 whitespace-pre-wrap text-sm text-[#d6d6d6]">{event.remarks}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      </section>
    </AppShell>
  );
}
