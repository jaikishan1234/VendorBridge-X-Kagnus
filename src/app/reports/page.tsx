import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportsPanel } from "@/components/reports/reports-panel";
import { getCurrentUser } from "@/lib/auth";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PROCUREMENT_OFFICER") redirect("/dashboard");

  return <AppShell activeItem="Reports" user={user}><section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8"><header><h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Reports</h1><p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">Procurement records and generated document values.</p></header><ReportsPanel /></section></AppShell>;
}
