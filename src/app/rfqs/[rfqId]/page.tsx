import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { rfqLineItems, rfqVendorAssignments, rfqs, vendors } from "@/db/schema";
import { getRfqViewer } from "@/lib/rfq-access";

type RfqDetailPageProps = {
  params: Promise<{ rfqId: string }>;
};

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDeadline(deadline: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(deadline);
}

export default async function RfqDetailPage({ params }: RfqDetailPageProps) {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") {
    redirect("/login");
  }

  if (viewer.kind === "forbidden") {
    redirect("/dashboard");
  }

  const { rfqId } = await params;

  if (!z.string().uuid().safeParse(rfqId).success) {
    notFound();
  }

  if (viewer.kind === "unlinked-vendor") {
    notFound();
  }

  const rfqSelection = {
    id: rfqs.id,
    rfqNumber: rfqs.rfqNumber,
    title: rfqs.title,
    description: rfqs.description,
    status: rfqs.status,
    deadline: rfqs.deadline,
    currency: rfqs.currency,
  };
  const [rfq] =
    viewer.kind === "procurement"
      ? await db
          .select(rfqSelection)
          .from(rfqs)
          .where(eq(rfqs.id, rfqId))
          .limit(1)
      : await db
          .select(rfqSelection)
          .from(rfqs)
          .innerJoin(rfqVendorAssignments, eq(rfqVendorAssignments.rfqId, rfqs.id))
          .where(
            and(
              eq(rfqs.id, rfqId),
              eq(rfqVendorAssignments.vendorId, viewer.vendorId),
            ),
          )
          .limit(1);

  if (!rfq) {
    notFound();
  }

  const lineItems = await db
    .select()
    .from(rfqLineItems)
    .where(eq(rfqLineItems.rfqId, rfq.id))
    .orderBy(asc(rfqLineItems.lineNumber));
  const assignedVendors =
    viewer.kind === "procurement"
      ? await db
          .select({
            id: vendors.id,
            vendorName: vendors.vendorName,
            category: vendors.category,
            contactName: vendors.contactName,
            email: vendors.email,
            status: vendors.status,
          })
          .from(rfqVendorAssignments)
          .innerJoin(vendors, eq(rfqVendorAssignments.vendorId, vendors.id))
          .where(eq(rfqVendorAssignments.rfqId, rfq.id))
          .orderBy(asc(vendors.vendorName))
      : [];

  return (
    <AppShell activeItem="RFQs" user={viewer.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <Link
          className="text-sm text-[#c7c7c7] underline-offset-4 transition-colors hover:text-[#efefef] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
          href="/rfqs"
        >
          Back to RFQs
        </Link>

        <header className="mt-7">
          <p className="font-mono text-xs text-[#a8a8a8]">{rfq.rfqNumber}</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
            {rfq.title}
          </h1>
          <p className="mt-2 text-sm text-[#c7c7c7]">
            {formatStatus(rfq.status)} · Deadline: {formatDeadline(rfq.deadline)} · {rfq.currency}
          </p>
          {rfq.description ? (
            <p className="mt-5 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-[#d6d6d6]">
              {rfq.description}
            </p>
          ) : null}
        </header>

        <section aria-labelledby="line-items-heading" className="mt-9">
          <h2 className="text-lg font-medium" id="line-items-heading">
            Line Items
          </h2>
          <div className="mt-3 overflow-hidden rounded-[6px] border border-[#777777]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Unit</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((lineItem) => (
                  <tr className="border-t border-[#454545]" key={lineItem.id}>
                    <td className="px-4 py-3 text-[#d6d6d6]">{lineItem.lineNumber}</td>
                    <td className="px-4 py-3 text-[#efefef]">{lineItem.description}</td>
                    <td className="px-4 py-3 text-[#d6d6d6]">{lineItem.quantity}</td>
                    <td className="px-4 py-3 text-[#d6d6d6]">{lineItem.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {viewer.kind === "procurement" ? (
          <section aria-labelledby="vendors-heading" className="mt-9">
            <h2 className="text-lg font-medium" id="vendors-heading">
              Assigned Vendors
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assignedVendors.map((vendor) => (
                <article
                  className="rounded-[6px] border border-[#777777] bg-[#151515] p-4"
                  key={vendor.id}
                >
                  <h3 className="font-medium text-[#efefef]">{vendor.vendorName}</h3>
                  <p className="mt-1 text-sm text-[#c7c7c7]">
                    {vendor.category} · {formatStatus(vendor.status)}
                  </p>
                  <p className="mt-4 text-sm text-[#d6d6d6]">{vendor.contactName}</p>
                  <p className="mt-1 break-words text-sm text-[#d6d6d6]">{vendor.email}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}
