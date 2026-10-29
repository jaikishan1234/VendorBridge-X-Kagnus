import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getMyQuotations } from "@/lib/my-quotations";
import { getRfqViewer } from "@/lib/rfq-access";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function MyQuotationsPage() {
  const viewer = await getRfqViewer();
  if (viewer.kind === "unauthenticated") redirect("/login");
  if (viewer.kind === "procurement" || viewer.kind === "forbidden") redirect("/dashboard");

  if (viewer.kind === "unlinked-vendor") {
    return (
      <AppShell activeItem="Quotations" user={viewer.user}>
        <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">My Quotations</h1>
          <div className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-5 text-sm text-[#c7c7c7]">
            Your account is not linked to a vendor profile yet. Create a profile or contact your procurement team to request access.
            <Link className="mt-4 inline-flex h-9 items-center rounded-[4px] border border-[#8a8a8a] px-4 text-sm text-[#efefef] hover:bg-[#252525]" href="/vendor-profile/new">
              Create My Vendor Profile
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  let quotations: Awaited<ReturnType<typeof getMyQuotations>> = [];
  let loadFailed = false;
  try {
    quotations = await getMyQuotations(viewer.vendorId);
  } catch (error) {
    console.error("Load my quotations error:", error);
    loadFailed = true;
  }

  return (
    <AppShell activeItem="Quotations" user={viewer.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">My Quotations</h1>
          <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">Review drafts and submitted quotations for your vendor profile.</p>
        </header>

        {loadFailed ? (
          <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">
            Unable to load your quotations. Please try again.
          </p>
        ) : quotations.length === 0 ? (
          <div className="mt-7 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">
            You have not saved or submitted any quotations yet.
          </div>
        ) : (
          <div className="mt-7 overflow-hidden rounded-[6px] border border-[#777777]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-sm">
                <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                  <tr>
                    <th className="px-4 py-3 font-medium">RFQ</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Comparable total</th>
                    <th className="px-4 py-3 font-medium">Delivery timeline</th>
                    <th className="px-4 py-3 font-medium">Updated</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.map((quotation) => (
                    <tr className="border-t border-[#454545]" key={quotation.id}>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-[#efefef]">{quotation.rfqNumber}</p>
                        <p className="mt-1 text-[#d6d6d6]">{quotation.rfqTitle}</p>
                      </td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{quotation.status === "SUBMITTED" ? "Submitted" : "Draft"}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{quotation.total ? `${quotation.currency} ${quotation.total}` : "Incomplete draft"}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{quotation.deliveryTimeline || "Not provided"}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{formatDate(quotation.submittedAt ?? quotation.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <Link className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href={`/rfqs/${quotation.rfqId}`}>
                          Open RFQ
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
