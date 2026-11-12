import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";

type DashboardPageProps = {
  searchParams: Promise<{ comingSoon?: string | string[] }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { comingSoon } = await searchParams;
  const requestedFeature =
    typeof comingSoon === "string" ? comingSoon : undefined;

  let dashboard = null;
  try {
    dashboard = await getDashboardData(user);
  } catch (error) {
    console.error("Unable to load dashboard data", error);
  }

  return <DashboardShell dashboard={dashboard} requestedFeature={requestedFeature} user={user} />;
}
