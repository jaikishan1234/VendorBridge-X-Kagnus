"use client";

import { useEffect, useState } from "react";

type ActivityItem = {
  id: string;
  eventType: string;
  occurredAt: string;
  actorUsername: string | null;
  description: string;
  rfqNumber: string | null;
  rfqTitle: string | null;
  vendorName: string | null;
  purchaseOrderNumber: string | null;
  invoiceNumber: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ActivityTimeline() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void fetch("/api/activity")
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { activities?: ActivityItem[]; message?: string } | null;
        if (!response.ok) throw new Error(payload?.message ?? "Unable to load activity.");
        if (isCurrent) setActivities(payload?.activities ?? []);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load activity.");
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => { isCurrent = false; };
  }, []);

  if (isLoading) return <p className="mt-7 text-sm text-[#c7c7c7]" role="status">Loading activity&hellip;</p>;
  if (error) return <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">{error}</p>;
  if (activities.length === 0) return <div className="mt-7 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">No activity is available yet.</div>;

  return (
    <ol className="mt-7 space-y-3" aria-label="Activity timeline">
      {activities.map((activity) => (
        <li className="rounded-[6px] border border-[#777777] bg-[#151515] p-4" key={activity.id}>
          <p className="text-sm text-[#efefef]">{activity.description}</p>
          <p className="mt-2 text-xs text-[#a8a8a8]">
            {activity.actorUsername ? `${activity.actorUsername} · ` : ""}{formatDate(activity.occurredAt)}
          </p>
          {activity.vendorName || activity.rfqTitle ? (
            <p className="mt-2 text-xs text-[#c7c7c7]">
              {activity.rfqNumber ? `${activity.rfqNumber}${activity.rfqTitle ? ` · ${activity.rfqTitle}` : ""}` : ""}
              {activity.vendorName ? `${activity.rfqNumber ? " · " : ""}${activity.vendorName}` : ""}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
