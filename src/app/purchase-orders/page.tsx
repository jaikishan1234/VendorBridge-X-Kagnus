import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PurchaseOrdersPanel } from "@/components/purchase-orders/purchase-orders-panel";
import { getRfqViewer } from "@/lib/rfq-access";

export default async function PurchaseOrdersPage() {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") redirect("/login");
  if (viewer.kind === "forbidden") redirect("/dashboard");

  if (viewer.kind === "unlinked-vendor") {
    return (
      <AppShell activeItem="Purchase Orders" user={viewer.user}>
        <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">My Purchase Orders</h1>
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

  return (
    <AppShell activeItem="Purchase Orders" user={viewer.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <PurchaseOrdersPanel isProcurement={viewer.kind === "procurement"} />
      </section>
    </AppShell>
  );
}
