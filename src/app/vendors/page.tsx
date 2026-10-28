import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { requireRole } from "@/lib/authorization";
import { redirect } from "next/navigation";

const statusFilters = ["ACTIVE", "PENDING", "BLOCKED"] as const;

type VendorStatusFilter = (typeof statusFilters)[number];

type VendorsPageProps = {
  searchParams: Promise<{ query?: string | string[]; status?: string | string[] }>;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function getStatusFilter(value: string): VendorStatusFilter | undefined {
  return statusFilters.includes(value as VendorStatusFilter)
    ? (value as VendorStatusFilter)
    : undefined;
}

function formatStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function vendorListHref(query: string, status?: VendorStatusFilter) {
  const params = new URLSearchParams();

  if (query) params.set("query", query);
  if (status) params.set("status", status);

  const search = params.toString();
  return search ? `/vendors?${search}` : "/vendors";
}

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const user = authorization.user;

  const params = await searchParams;
  const query = getSingleSearchParam(params.query).trim().slice(0, 100);
  const status = getStatusFilter(getSingleSearchParam(params.status));
  let vendorRows: (typeof vendors.$inferSelect)[] = [];
  let hasLoadError = false;

  try {
    const searchFilter = query
      ? or(
          ilike(vendors.vendorName, `%${query}%`),
          ilike(vendors.gstNumber, `%${query}%`),
          ilike(vendors.category, `%${query}%`),
        )
      : undefined;
    const statusFilter = status ? eq(vendors.status, status) : undefined;
    const filters =
      searchFilter && statusFilter
        ? and(searchFilter, statusFilter)
        : searchFilter ?? statusFilter;

    vendorRows = await db
      .select()
      .from(vendors)
      .where(filters)
      .orderBy(desc(vendors.createdAt));
  } catch (error) {
    console.error("Load vendors error:", error);
    hasLoadError = true;
  }

  return (
    <AppShell activeItem="Vendors" user={user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
              Vendors
            </h1>
            <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
              Manage supplier profiles and registrations
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
            href="/vendors/new"
          >
            + Add Vendor
          </Link>
        </header>

        <form action="/vendors" className="mt-7 flex gap-3">
          <label className="sr-only" htmlFor="vendor-search">
            Search vendors
          </label>
          <Input
            className="h-11 rounded-[5px] border-[#777777] bg-transparent px-4 text-sm text-[#ededed] placeholder:text-[#a8a8a8] focus-visible:border-[#e0e0e0] focus-visible:ring-[#d8d8d8]/25 dark:bg-transparent"
            defaultValue={query}
            id="vendor-search"
            name="query"
            placeholder="Search by vendor name, GST number, or category..."
            type="search"
          />
          {status ? <input name="status" type="hidden" value={status} /> : null}
          <button
            className="rounded-[5px] border border-[#8a8a8a] px-4 text-sm text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
            type="submit"
          >
            Search
          </button>
        </form>

        <nav aria-label="Vendor status filters" className="mt-5 flex flex-wrap gap-2">
          <Link
            aria-current={!status ? "page" : undefined}
            className={`rounded-[4px] border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50 ${
              !status
                ? "border-[#9a9a9a] bg-[#252525] text-[#f1f1f1]"
                : "border-[#6e6e6e] text-[#c7c7c7] hover:bg-[#252525]"
            }`}
            href={vendorListHref(query)}
          >
            All
          </Link>
          {statusFilters.map((filter) => (
            <Link
              aria-current={status === filter ? "page" : undefined}
              className={`rounded-[4px] border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50 ${
                status === filter
                  ? "border-[#9a9a9a] bg-[#252525] text-[#f1f1f1]"
                  : "border-[#6e6e6e] text-[#c7c7c7] hover:bg-[#252525]"
              }`}
              href={vendorListHref(query, filter)}
              key={filter}
            >
              {formatStatus(filter)}
            </Link>
          ))}
        </nav>

        <div className="mt-4 overflow-hidden rounded-[6px] border border-[#777777]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                <tr>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Vendor Name
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Category
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    GST No.
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Contact No.
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Status
                  </th>
                  <th className="px-4 py-3 font-medium" scope="col">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {hasLoadError ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-[#f19a9a]" colSpan={6}>
                      Vendors could not be loaded. Please try again later.
                    </td>
                  </tr>
                ) : vendorRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-sm text-[#a8a8a8]" colSpan={6}>
                      {query || status
                        ? "No vendors match the current search or filter."
                        : "No vendors have been added yet."}
                    </td>
                  </tr>
                ) : (
                  vendorRows.map((vendor) => (
                    <tr className="border-t border-[#454545]" key={vendor.id}>
                      <td className="px-4 py-3 text-[#efefef]">{vendor.vendorName}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{vendor.category}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">
                        {vendor.gstNumber ?? "Not provided"}
                      </td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{vendor.phoneNumber}</td>
                      <td className="px-4 py-3 text-[#d6d6d6]">{formatStatus(vendor.status)}</td>
                      <td className="px-4 py-3">
                        <Link
                          className="inline-flex h-7 items-center rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
                          href={`/vendors/${vendor.id}`}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
