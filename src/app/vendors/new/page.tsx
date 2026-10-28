import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { VendorForm } from "@/components/vendors/vendor-form";
import { requireRole } from "@/lib/authorization";

export default async function NewVendorPage() {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

  if (!authorization.authorized) {
    redirect(authorization.status === 401 ? "/login" : "/dashboard");
  }

  const user = authorization.user;

  return (
    <AppShell activeItem="Vendors" user={user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Add Vendor
        </h1>
        <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
          Add a supplier profile to VendorBridge.
        </p>
        <VendorForm />
      </section>
    </AppShell>
  );
}
