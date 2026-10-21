import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";

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

  return <DashboardShell requestedFeature={requestedFeature} user={user} />;
}
