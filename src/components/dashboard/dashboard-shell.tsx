import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import type { UserRole } from "@/db/schema";

type DashboardUser = {
  username: string;
  email: string;
  role: UserRole;
};

type DashboardShellProps = {
  user: DashboardUser;
  requestedFeature?: string;
};

const summaryCards = [
  "Active RFQs",
  "Pending Approvals",
  "Purchase Orders This Month",
  "Overdue Invoices",
];

function formatRole(role: UserRole) {
  return role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function featureHref(feature: string) {
  return `/dashboard?comingSoon=${encodeURIComponent(feature)}`;
}

export function DashboardShell({ user, requestedFeature }: DashboardShellProps) {
  const knownFeature = [
    "RFQs",
    "Quotations",
    "Approvals",
    "Purchase Orders",
    "Invoices",
    "Reports",
    "Activity",
  ].includes(requestedFeature ?? "")
    ? requestedFeature
    : undefined;

  return (
    <AppShell activeItem="Dashboard" user={user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
            <header>
              <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                Dashboard
              </h1>
              <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
                Welcome back, {user.username} &middot; {formatRole(user.role)}
              </p>
            </header>

            {knownFeature ? (
              <div
                className="mt-5 rounded-[4px] border border-[#6e6e6e] bg-[#151515] px-4 py-3 text-sm text-[#d6d6d6]"
                role="status"
              >
                {knownFeature} is coming soon. This Week 1 dashboard does not
                include that module yet.
              </div>
            ) : null}

            <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {summaryCards.map((title) => (
                <article
                  className="min-h-[120px] rounded-[7px] border border-[#777777] bg-[#151515] p-4"
                  key={title}
                >
                  <p className="text-2xl font-medium text-[#efefef]">&mdash;</p>
                  <h2 className="mt-3 text-sm leading-5 text-[#d6d6d6]">
                    {title}
                  </h2>
                  <p className="mt-1 text-xs text-[#9f9f9f]">
                    Data unavailable
                  </p>
                </article>
              ))}
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(250px,0.8fr)]">
              <section aria-labelledby="recent-orders-heading">
                <h2
                  className="mb-3 text-sm font-medium text-[#e8e8e8]"
                  id="recent-orders-heading"
                >
                  Recent Purchase Orders
                </h2>
                <div className="overflow-hidden rounded-[6px] border border-[#777777]">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[460px] border-collapse text-left text-sm">
                      <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]">
                        <tr>
                          <th className="px-4 py-3 font-medium" scope="col">
                            PO#
                          </th>
                          <th className="px-4 py-3 font-medium" scope="col">
                            Vendor
                          </th>
                          <th className="px-4 py-3 font-medium" scope="col">
                            Amount
                          </th>
                          <th className="px-4 py-3 font-medium" scope="col">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            className="px-4 py-10 text-center text-sm text-[#a8a8a8]"
                            colSpan={4}
                          >
                            No purchase orders are available yet.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section aria-labelledby="spending-trends-heading">
                <h2
                  className="mb-3 text-sm font-medium text-[#e8e8e8]"
                  id="spending-trends-heading"
                >
                  Spending Trends &middot; Last 6 Months
                </h2>
                <div className="flex min-h-[192px] items-center justify-center rounded-[6px] border border-[#777777] bg-[#151515] p-6 text-center">
                  <p className="max-w-[192px] text-sm leading-6 text-[#a8a8a8]">
                    No spending data is available yet.
                  </p>
                </div>
              </section>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-[#777777] pt-6 sm:flex-row sm:flex-wrap">
              <Link
                className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
                href={featureHref("RFQs")}
              >
                + New RFQ
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
                href="/vendors/new"
              >
                Add Vendor
              </Link>
              <Link
                className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
                href={featureHref("Invoices")}
              >
                View Invoices
              </Link>
            </div>
      </section>
    </AppShell>
  );
}
