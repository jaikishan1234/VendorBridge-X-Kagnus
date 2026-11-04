"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApprovalDecisionForm({ approvalId }: { approvalId: string }) {
  const [remarks, setRemarks] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  async function submit(action: "APPROVE" | "REJECT") {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/approvals/${approvalId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, remarks }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) {
        setError(payload?.message ?? "Unable to save the approval decision.");
        return;
      }

      setSuccess(payload?.message ?? "Approval decision saved.");
      router.refresh();
    } catch {
      setError("Unable to save the approval decision. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="approval-decision-heading" className="mt-8 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
      <h2 className="text-lg font-medium" id="approval-decision-heading">Decision</h2>
      <label className="mt-4 block text-sm text-[#d6d6d6]">
        Decision remarks
        <textarea
          className="mt-2 block min-h-28 w-full rounded-[4px] border border-[#747474] bg-[#181818] p-3 text-sm text-[#efefef] outline-none focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25"
          disabled={isSubmitting}
          onChange={(event) => setRemarks(event.target.value)}
          value={remarks}
        />
      </label>
      <p className="mt-2 text-xs text-[#b7b7b7]">Remarks are required and become part of the permanent approval history.</p>
      {error ? <p className="mt-4 rounded-[4px] border border-[#b86d6d] bg-[#2a1717] p-3 text-sm text-[#f2bbbb]" role="alert">{error}</p> : null}
      {success ? <p className="mt-4 rounded-[4px] border border-[#638d67] bg-[#142418] p-3 text-sm text-[#c8e9ca]" role="status">{success}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="h-9 rounded-[4px] border border-[#72a877] bg-[#214829] px-4 text-sm text-[#d8f3d9] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => submit("APPROVE")}
          type="button"
        >
          {isSubmitting ? "Saving…" : "Approve quotation"}
        </button>
        <button
          className="h-9 rounded-[4px] border border-[#b86d6d] px-4 text-sm text-[#f2bbbb] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          onClick={() => submit("REJECT")}
          type="button"
        >
          {isSubmitting ? "Saving…" : "Reject quotation"}
        </button>
      </div>
    </section>
  );
}
