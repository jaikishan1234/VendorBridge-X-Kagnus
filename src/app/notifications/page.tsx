import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";
import { getActivityViewer } from "@/lib/activity";

export default async function NotificationsPage() {
  const viewer = await getActivityViewer();
  if (viewer.kind === "unauthenticated") redirect("/login");
  if (viewer.kind === "forbidden") redirect("/dashboard");

  return (
    <AppShell activeItem="Notifications" user={viewer.user}>
      <section className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
        <header>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">Notifications</h1>
          <p className="mt-2 text-sm text-[#c7c7c7] sm:text-base">Updates from procurement records you are authorized to access.</p>
        </header>
        <NotificationsPanel />
      </section>
    </AppShell>
  );
}
