"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

function getResponseMessage(payload: unknown): string | undefined {
  return typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : undefined;
}

export function PublishRfqButton({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    if (isPublishing) return;
    setIsPublishing(true);
    setError(null);

    try {
      const response = await fetch(`/api/rfqs/${rfqId}/publish`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getResponseMessage(payload) ?? "Unable to publish this RFQ.");
        return;
      }

      router.refresh();
    } catch {
      setError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <div className="mt-5">
      {error ? <p className="mb-3 text-sm text-[#f19a9a]" role="alert">{error}</p> : null}
      <Button
        className="h-9 rounded-[4px] px-4 text-sm"
        disabled={isPublishing}
        onClick={publish}
        type="button"
        variant="outline"
      >
        {isPublishing ? "Publishing..." : "Publish RFQ"}
      </Button>
      <p className="mt-2 text-xs text-[#a8a8a8]">
        Publishing makes this RFQ available to its assigned vendors. Vendor notifications are not sent automatically.
      </p>
    </div>
  );
}
