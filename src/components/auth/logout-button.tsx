"use client";

import { useState } from "react";

function getResponseMessage(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return undefined;
}

export function LogoutButton() {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    if (isSubmitting) {
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          getResponseMessage(payload) ??
            "We could not log you out. Please try again.",
        );
        return;
      }

      window.location.replace("/login");
    } catch {
      setError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        aria-busy={isSubmitting}
        className="rounded-[4px] border border-[#8a8a8a] px-3 py-1 text-xs font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/60 disabled:cursor-wait disabled:opacity-60"
        disabled={isSubmitting}
        onClick={handleLogout}
        type="button"
      >
        {isSubmitting ? "Logging out..." : "Log out"}
      </button>
      {error ? (
        <p className="max-w-48 text-right text-xs text-[#f19a9a]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
