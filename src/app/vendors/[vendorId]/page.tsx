import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { requireRole } from "@/lib/authorization";

type VendorDetailPageProps = {
  params: Promise<{ vendorId: string }>;
};

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const user = authorization.user;

  const { vendorId } = await params;
  let vendor: typeof vendors.$inferSelect | undefined;
  let hasLoadError = false;

  try {
    [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);
  } catch (error) {
    console.error("Load vendor detail error:", error);
    hasLoadError = true;
  }

  return (
    <AppShell activeItem="Vendors" user={user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <Link
          className="text-sm text-[#c7c7c7] underline-offset-4 transition-colors hover:text-[#efefef] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
          href="/vendors"
        >
          Back to Vendors
        </Link>

        {hasLoadError ? (
          <p className="mt-7 text-sm text-[#f19a9a]" role="alert">
            Vendor details could not be loaded. Please try again later.
          </p>
        ) : !vendor ? (
          <div className="mt-7 rounded-[6px] border border-[#777777] bg-[#151515] p-6">
            <h1 className="text-2xl font-medium">Vendor not found</h1>
            <p className="mt-2 text-sm text-[#c7c7c7]">
              This vendor may have been removed or the link is incorrect.
            </p>
          </div>
        ) : (
          <>
            <header className="mt-7">
              <p className="text-sm text-[#a8a8a8]">Vendor profile</p>
              <h1 className="mt-1 text-2xl font-medium tracking-tight sm:text-3xl">
                {vendor.vendorName}
              </h1>
              <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
                {vendor.category} &middot; {formatStatus(vendor.status)}
              </p>
            </header>

            <dl className="mt-7 grid max-w-3xl gap-4 sm:grid-cols-2">
              <div className="rounded-[6px] border border-[#777777] bg-[#151515] p-4">
                <dt className="text-xs text-[#a8a8a8]">Contact Name</dt>
                <dd className="mt-2 text-sm text-[#efefef]">{vendor.contactName}</dd>
              </div>
              <div className="rounded-[6px] border border-[#777777] bg-[#151515] p-4">
                <dt className="text-xs text-[#a8a8a8]">Email</dt>
                <dd className="mt-2 break-words text-sm text-[#efefef]">{vendor.email}</dd>
              </div>
              <div className="rounded-[6px] border border-[#777777] bg-[#151515] p-4">
                <dt className="text-xs text-[#a8a8a8]">Phone Number</dt>
                <dd className="mt-2 text-sm text-[#efefef]">{vendor.phoneNumber}</dd>
              </div>
              <div className="rounded-[6px] border border-[#777777] bg-[#151515] p-4">
                <dt className="text-xs text-[#a8a8a8]">GST Number</dt>
                <dd className="mt-2 text-sm text-[#efefef]">{vendor.gstNumber ?? "Not provided"}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </AppShell>
  );
}
