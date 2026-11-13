import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import type { UserRole } from "@/db/schema";
import type { DashboardData } from "@/lib/dashboard";

type DashboardUser = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
};

type DashboardShellProps = {
  dashboard: DashboardData | null;
  user: DashboardUser;
};

function formatRole(role: UserRole) {
  return role.toLowerCase().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function formatAmount(currency: string, amount: string) {
  return `${currency} ${amount}`;
}

export function DashboardShell({ dashboard, user }: DashboardShellProps) {
  return (
    <AppShell activeItem="Dashboard" user={user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">Welcome back, {user.username} &middot; {formatRole(user.role)}</p>
        </header>

        {!dashboard ? <div className="mt-5 rounded-[4px] border border-[#9e5a5a] bg-[#2a1717] px-4 py-3 text-sm text-[#f0c9c9]" role="alert">Dashboard data is unavailable. Please try again later.</div> : null}

        {dashboard?.metrics.length ? (
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {dashboard.metrics.map((metric) => (
              <article className="min-h-[120px] rounded-[7px] border border-[#777777] bg-[#151515] p-4" key={metric.label}>
                <p className="text-2xl font-medium text-[#efefef]">{metric.value}</p>
                <h2 className="mt-3 text-sm leading-5 text-[#d6d6d6]">{metric.label}</h2>
                <p className="mt-1 text-xs text-[#9f9f9f]">{metric.description}</p>
              </article>
            ))}
          </div>
        ) : dashboard ? <p className="mt-7 text-sm text-[#a8a8a8]">Dashboard metrics are not available for your role.</p> : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(250px,0.8fr)]">
          <section aria-labelledby="recent-orders-heading">
            <h2 className="mb-3 text-sm font-medium text-[#e8e8e8]" id="recent-orders-heading">Recent Purchase Orders</h2>
            <div className="overflow-hidden rounded-[6px] border border-[#777777]"><div className="overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-left text-sm">
                <thead className="border-b border-[#6e6e6e] bg-[#151515] text-xs text-[#c7c7c7]"><tr><th className="px-4 py-3 font-medium" scope="col">PO#</th><th className="px-4 py-3 font-medium" scope="col">Vendor</th><th className="px-4 py-3 font-medium" scope="col">Amount</th><th className="px-4 py-3 font-medium" scope="col">Status</th></tr></thead>
                <tbody>
                  {dashboard?.recentPurchaseOrders.length ? dashboard.recentPurchaseOrders.map((purchaseOrder) => (
                    <tr className="border-t border-[#333333] text-[#d6d6d6]" key={purchaseOrder.id}><td className="px-4 py-3">{purchaseOrder.poNumber}</td><td className="px-4 py-3">{purchaseOrder.vendorName}</td><td className="px-4 py-3">{formatAmount(purchaseOrder.currency, purchaseOrder.totalAmount)}</td><td className="px-4 py-3">{purchaseOrder.status}</td></tr>
                  )) : <tr><td className="px-4 py-10 text-center text-sm text-[#a8a8a8]" colSpan={4}>{dashboard ? dashboard.recentPurchaseOrdersEmptyMessage : "Data unavailable"}</td></tr>}
                </tbody>
              </table>
            </div></div>
          </section>

          <section aria-labelledby="spending-trends-heading">
            <h2 className="mb-3 text-sm font-medium text-[#e8e8e8]" id="spending-trends-heading">Purchase Order Value &middot; Last 6 Months</h2>
            <div className="min-h-[192px] rounded-[6px] border border-[#777777] bg-[#151515] p-4">
              {dashboard?.spendingTrends.length ? <ul className="space-y-3">{dashboard.spendingTrends.map((trend) => <li className="border-b border-[#333333] pb-3 text-sm text-[#d6d6d6]" key={`${trend.month}-${trend.currency}`}><p>{trend.month} &middot; {trend.currency}</p><p className="mt-1 text-base font-medium text-[#efefef]">{formatAmount(trend.currency, trend.totalAmount)}</p><p className="mt-1 text-xs text-[#a8a8a8]">{trend.purchaseOrderCount} generated purchase order{trend.purchaseOrderCount === 1 ? "" : "s"}</p></li>)}</ul> : <div className="flex min-h-[158px] items-center justify-center text-center"><p className="max-w-[210px] text-sm leading-6 text-[#a8a8a8]">{dashboard ? dashboard.spendingTrendsEmptyMessage : "Data unavailable"}</p></div>}
            </div>
          </section>
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t border-[#777777] pt-6 sm:flex-row sm:flex-wrap">
          {user.role === "PROCUREMENT_OFFICER" ? <Link className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href="/rfqs/new">+ New RFQ</Link> : null}
          {user.role === "PROCUREMENT_OFFICER" ? <Link className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href="/vendors/new">Add Vendor</Link> : null}
          {user.role === "PROCUREMENT_OFFICER" || user.role === "VENDOR" ? <Link className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#8a8a8a] px-5 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href="/invoices">View Invoices</Link> : null}
        </div>
      </section>
    </AppShell>
  );
}
