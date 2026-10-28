import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { rfqVendorAssignments, rfqs } from "@/db/schema";
import { getRfqViewer } from "@/lib/rfq-access";

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDeadline(deadline: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(deadline);
}

export default async function RfqsPage() {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") {
    redirect("/login");
  }

  if (viewer.kind === "forbidden") {
    redirect("/dashboard");
  }

  const rfqSelection = {
    id: rfqs.id,
    rfqNumber: rfqs.rfqNumber,
    title: rfqs.title,
    category: rfqs.category,
    status: rfqs.status,
    deadline: rfqs.deadline,
    currency: rfqs.currency,
  };
  const rfqRows =
    viewer.kind === "procurement"
      ? await db.select(rfqSelection).from(rfqs).orderBy(desc(rfqs.createdAt))
      : viewer.kind === "vendor"
        ? await db
            .select(rfqSelection)
            .from(rfqVendorAssignments)
            .innerJoin(rfqs, eq(rfqVendorAssignments.rfqId, rfqs.id))
            .where(eq(rfqVendorAssignments.vendorId, viewer.vendorId))
            .orderBy(desc(rfqs.createdAt))
        : [];
  const isProcurement = viewer.kind === "procurement";
  const isUnlinkedVendor = viewer.kind === "unlinked-vendor";

  return (
    <AppShell activeItem="RFQs" user={viewer.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
              {isProcurement ? "RFQs" : "Assigned RFQs"}
            </h1>
            <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
              {isProcurement
                ? "Create and manage vendor quotation requests."
                : "Review quotation requests assigned to your vendor."}
            </p>
          </div>
          {isProcurement ? (
            <Link
              className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
              href="/rfqs/new"
            >
              + Create RFQ
            </Link>
          ) : null}
        </header>

        {isUnlinkedVendor ? (
          <p className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-5 text-sm text-[#c7c7c7]">
            Your account is not linked to a vendor profile yet. Contact your procurement team for access to assigned RFQs.
          </p>
        ) : (
          <div className="mt-7 overflow-hidden rounded-[6px] border border-[#777777]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                  <tr>
                    <th className="px-4 py-3 font-medium" scope="col">RFQ</th>
                    <th className="px-4 py-3 font-medium" scope="col">Title</th>
                    <th className="px-4 py-3 font-medium" scope="col">Category</th>
                    <th className="px-4 py-3 font-medium" scope="col">Status</th>
                    <th className="px-4 py-3 font-medium" scope="col">Deadline</th>
                    <th className="px-4 py-3 font-medium" scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rfqRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-[#a8a8a8]" colSpan={6}>
                        {isProcurement
                          ? "No RFQs have been created yet."
                          : "No RFQs are currently assigned to your vendor."}
                      </td>
                    </tr>
                  ) : (
                    rfqRows.map((rfq) => (
                      <tr className="border-t border-[#454545]" key={rfq.id}>
                        <td className="px-4 py-3 font-mono text-xs text-[#efefef]">{rfq.rfqNumber}</td>
                        <td className="px-4 py-3 text-[#d6d6d6]">{rfq.title}</td>
                        <td className="px-4 py-3 text-[#d6d6d6]">{rfq.category}</td>
                        <td className="px-4 py-3 text-[#d6d6d6]">{formatStatus(rfq.status)}</td>
                        <td className="px-4 py-3 text-[#d6d6d6]">{formatDeadline(rfq.deadline)} · {rfq.currency}</td>
                        <td className="px-4 py-3">
                          <Link className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href={`/rfqs/${rfq.id}`}>View</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}
