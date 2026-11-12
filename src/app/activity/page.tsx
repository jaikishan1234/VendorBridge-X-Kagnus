import { redirect } from "next/navigation";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { AppShell } from "@/components/app-shell";
import { getActivityViewer } from "@/lib/activity";

export default async function ActivityPage() {
  const viewer = await getActivityViewer();
  if (viewer.kind === "unauthenticated") redirect("/login");
  if (viewer.kind === "forbidden") redirect("/dashboard");

  return (
    <AppShell activeItem="Activity" user={viewer.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Activity</h1>
          <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">Recent procurement activity you are authorized to view.</p>
        </header>
        <ActivityTimeline />
      </section>
    </AppShell>
  );
}
