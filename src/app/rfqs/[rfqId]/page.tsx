import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { PublishRfqButton } from "@/components/rfqs/publish-rfq-button";
import { db } from "@/db";
import { rfqAttachments, rfqLineItems, rfqVendorAssignments, rfqs, vendors } from "@/db/schema";
import { getRfqViewer } from "@/lib/rfq-access";

type RfqDetailPageProps = {
  params: Promise<{ rfqId: string }>;
  searchParams?: Promise<{ attachmentUpload?: string; publication?: string }>;
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

export default async function RfqDetailPage({ params, searchParams }: RfqDetailPageProps) {
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
    category: rfqs.category,
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
              eq(rfqs.status, "OPEN"),
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
  const attachments = await db
    .select({
      id: rfqAttachments.id,
      originalFilename: rfqAttachments.originalFilename,
      mimeType: rfqAttachments.mimeType,
      size: rfqAttachments.size,
    })
    .from(rfqAttachments)
    .where(eq(rfqAttachments.rfqId, rfq.id))
    .orderBy(asc(rfqAttachments.createdAt));
  const uploadWasPartial = (await searchParams)?.attachmentUpload === "partial";
  const publicationFailed = (await searchParams)?.publication === "failed";

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
          <p className="mt-1 text-sm text-[#c7c7c7]">Category: {rfq.category}</p>
          {rfq.description ? (
            <p className="mt-5 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-[#d6d6d6]">
              {rfq.description}
            </p>
          ) : null}
          {viewer.kind === "procurement" && rfq.status === "DRAFT" ? (
            <PublishRfqButton rfqId={rfq.id} />
          ) : null}
        </header>

        {uploadWasPartial ? (
          <p className="mt-5 rounded-[5px] border border-[#b86d6d] bg-[#2a1717] p-3 text-sm text-[#f2bbbb]" role="alert">
            The RFQ was created, but one or more attachments could not be added. The list below shows only attachments saved successfully.
          </p>
        ) : null}
        {publicationFailed ? (
          <p className="mt-5 rounded-[5px] border border-[#b86d6d] bg-[#2a1717] p-3 text-sm text-[#f2bbbb]" role="alert">
            The RFQ was saved as a draft but could not be published. Review its details and try publishing again.
          </p>
        ) : null}

        <section aria-labelledby="attachments-heading" className="mt-9">
          <h2 className="text-lg font-medium" id="attachments-heading">Attachments</h2>
          {attachments.length === 0 ? (
            <p className="mt-3 text-sm text-[#c7c7c7]">No attachments were added to this RFQ.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#454545] overflow-hidden rounded-[6px] border border-[#777777]">
              {attachments.map((attachment) => (
                <li className="flex items-center justify-between gap-4 p-4" key={attachment.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[#efefef]">{attachment.originalFilename}</p>
                    <p className="mt-1 text-xs text-[#b7b7b7]">{attachment.mimeType} · {(attachment.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <a
                    className="shrink-0 text-sm text-[#d6d6d6] underline-offset-4 hover:text-[#efefef] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
                    href={`/api/rfqs/${rfq.id}/attachments/${attachment.id}/download`}
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

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
