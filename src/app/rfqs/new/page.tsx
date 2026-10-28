import { asc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RfqForm } from "@/components/rfqs/rfq-form";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { requireRole } from "@/lib/authorization";

export default async function NewRfqPage() {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const vendorRows = await db
    .select({
      id: vendors.id,
      vendorName: vendors.vendorName,
      category: vendors.category,
      status: vendors.status,
    })
    .from(vendors)
    .orderBy(asc(vendors.vendorName));

  return (
    <AppShell activeItem="RFQs" user={authorization.user}>
      <section className="w-full min-w-0 max-w-full p-5 sm:p-7 lg:p-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Create RFQ&apos;s
        </h1>
        <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
          new request for quotation
        </p>
        <RfqForm vendors={vendorRows} />
      </section>
    </AppShell>
  );
}
