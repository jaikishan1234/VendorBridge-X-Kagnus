import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { VendorForm } from "@/components/vendors/vendor-form";
import { getCurrentUser } from "@/lib/auth";

export default async function NewVendorProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "VENDOR") {
    redirect("/dashboard");
  }

  return (
    <AppShell activeItem="Vendors" user={user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
          Create My Vendor Profile
        </h1>
        <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">
          Create a profile for your organization. It will be pending review.
        </p>
        <VendorForm
          endpoint="/api/vendor-profile"
          redirectTo="/rfqs"
          submitLabel="Create My Vendor Profile"
        />
      </section>
    </AppShell>
  );
}
