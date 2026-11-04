import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getPendingApprovals } from "@/lib/approvals";
import { requireRole } from "@/lib/authorization";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function ApprovalsPage() {
  const authorization = await requireRole(["MANAGER"]);
  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  let approvals: Awaited<ReturnType<typeof getPendingApprovals>> = [];
  let loadFailed = false;
  try {
    approvals = await getPendingApprovals();
  } catch (error) {
    console.error("Approvals page error:", error);
    loadFailed = true;
  }

  return (
    <AppShell activeItem="Approvals" user={authorization.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Pending Approvals</h1>
          <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">Review quotations selected by procurement officers.</p>
        </header>

        {loadFailed ? (
          <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">Unable to load pending approvals. Please try again.</p>
        ) : approvals.length === 0 ? (
          <div className="mt-7 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">There are no pending approvals.</div>
        ) : (
          <div className="mt-7 overflow-hidden rounded-[6px] border border-[#777777]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                  <tr>
                    <th className="px-4 py-3 font-medium">RFQ</th>
                    <th className="px-4 py-3 font-medium">Vendor</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Selected</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((approval) => (
                    <tr className="border-t border-[#454545]" key={approval.id}>
                      <td className="px-4 py-3"><p className="font-mono text-xs text-[#efefef]">{approval.rfqNumber}</p><p className="mt-1 text-[#d6d6d6]">{approval.rfqTitle}</p></td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{approval.vendorName}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{approval.currency} {approval.total}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]"><p>{formatDate(approval.selectedAt)}</p><p className="mt-1 text-xs text-[#b7b7b7]">by {approval.selectedByUsername}</p></td>
                      <td className="px-4 py-3"><Link className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525]" href={`/approvals/${approval.id}`}>Review</Link></td>
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
