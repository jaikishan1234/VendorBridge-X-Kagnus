"use client";

import { useEffect, useState } from "react";

type NotificationItem = {
  id: string;
  isRead: boolean;
  createdAt: string;
  actorUsername: string | null;
  description: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void fetch("/api/notifications")
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { notifications?: NotificationItem[]; message?: string } | null;
        if (!response.ok) throw new Error(payload?.message ?? "Unable to load notifications.");
        if (isCurrent) setNotifications(payload?.notifications ?? []);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "Unable to load notifications.");
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, []);

  async function markRead(notificationId: string) {
    const response = await fetch(`/api/notifications/${notificationId}/read`, { method: "PATCH" });
    if (!response.ok) {
      setError("Unable to mark this notification as read.");
      return;
    }
    setNotifications((current) => current.map((notification) => (
      notification.id === notificationId ? { ...notification, isRead: true } : notification
    )));
    window.dispatchEvent(new Event("vendorbridge:notifications-changed"));
  }

  if (isLoading) return <p className="mt-7 text-sm text-[#c7c7c7]" role="status">Loading notifications&hellip;</p>;
  if (error) return <p className="mt-7 rounded-[6px] border border-[#b86d6d] bg-[#2a1717] p-4 text-sm text-[#f2bbbb]" role="alert">{error}</p>;
  if (notifications.length === 0) return <div className="mt-7 rounded-[6px] border border-dashed border-[#777777] p-6 text-center text-sm text-[#c7c7c7]">No notifications yet.</div>;

  return (
    <ul className="mt-7 space-y-3" aria-label="Notifications">
      {notifications.map((notification) => (
        <li className={`rounded-[6px] border p-4 ${notification.isRead ? "border-[#555555] bg-[#151515]" : "border-[#72a877] bg-[#142418]"}`} key={notification.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm text-[#efefef]">{notification.description}</p>
              <p className="mt-2 text-xs text-[#a8a8a8]">{notification.actorUsername ? `${notification.actorUsername} · ` : ""}{formatDate(notification.createdAt)}</p>
            </div>
            {!notification.isRead ? <button className="h-8 rounded-[4px] border border-[#8a8a8a] px-3 text-xs text-[#efefef] hover:bg-[#252525]" onClick={() => void markRead(notification.id)} type="button">Mark as read</button> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
