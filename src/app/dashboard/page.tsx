import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  let dashboard = null;
  try {
    dashboard = await getDashboardData(user);
  } catch (error) {
    console.error("Unable to load dashboard data", error);
  }

  return <DashboardShell dashboard={dashboard} user={user} />;
}
