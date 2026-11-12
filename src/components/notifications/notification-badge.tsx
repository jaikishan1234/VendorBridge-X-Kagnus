"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function NotificationBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/unread-count");
      const payload = await response.json().catch(() => null) as { unreadCount?: number } | null;
      if (response.ok) setUnreadCount(payload?.unreadCount ?? 0);
    } catch {
      // Navigation remains usable if the count request is unavailable.
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => {
      void loadUnreadCount();
    }, 0);
    window.addEventListener("vendorbridge:notifications-changed", loadUnreadCount);
    return () => {
      window.clearTimeout(initialRequest);
      window.removeEventListener("vendorbridge:notifications-changed", loadUnreadCount);
    };
  }, [loadUnreadCount]);

  return (
    <Link
      aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ""}`}
      className="relative inline-flex size-8 items-center justify-center rounded-full border border-[#b7b7b7] text-xs font-medium text-[#e8e8e8] outline-none hover:bg-[#0d3a2e] focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/60"
      href="/notifications"
      title="Notifications"
    >
      <span aria-hidden="true">N</span>
      {unreadCount > 0 ? (
        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[#b83b3b] px-1 text-center text-[10px] leading-4 text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
