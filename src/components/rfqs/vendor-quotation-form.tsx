"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quotationDraftSchema, quotationSubmissionSchema } from "@/lib/validations/quotation";

type RfqLineItem = {
  id: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unit: string;
};

type SavedQuotation = {
  status: "DRAFT" | "SUBMITTED";
  deliveryTimeline: string | null;
  notes: string | null;
  lineItems: Array<{ rfqLineItemId: string; unitPrice: string }>;
};

type QuotationFormProps = {
  rfqId: string;
  currency: string;
  deadline: string;
  lineItems: RfqLineItem[];
};

function getMessage(payload: unknown): string | undefined {
  return typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : undefined;
}

function getQuotation(payload: unknown): SavedQuotation | null | undefined {
  if (typeof payload !== "object" || payload === null || !("quotation" in payload)) {
    return undefined;
  }

  const quotation = payload.quotation;
  if (quotation === null) return null;
  if (
    typeof quotation !== "object" ||
    quotation === null ||
    !("status" in quotation) ||
    (quotation.status !== "DRAFT" && quotation.status !== "SUBMITTED") ||
    !("lineItems" in quotation) ||
    !Array.isArray(quotation.lineItems)
  ) {
    return undefined;
  }

  return quotation as SavedQuotation;
}

export function VendorQuotationForm({ rfqId, currency, deadline, lineItems }: QuotationFormProps) {
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [deliveryTimeline, setDeliveryTimeline] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "SUBMITTED" | null>(null);
  const [isQuoteAvailable, setIsQuoteAvailable] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const deadlineTime = new Date(deadline).getTime();
    const availabilityTimer = window.setTimeout(() => {
      setIsQuoteAvailable(deadlineTime > Date.now());
    }, 0);
    const expiryTimer = window.setTimeout(
      () => setIsQuoteAvailable(false),
      Math.max(0, deadlineTime - Date.now()),
    );
    return () => {
      window.clearTimeout(availabilityTimer);
      window.clearTimeout(expiryTimer);
    };
  }, [deadline]);

  useEffect(() => {
    if (!isQuoteAvailable) return;
    let active = true;

    async function loadQuotation() {
      try {
        const response = await fetch(`/api/rfqs/${rfqId}/quotation`, {
          credentials: "same-origin",
        });
        const payload: unknown = await response.json().catch(() => null);
        const quotation = getQuotation(payload);

        if (!response.ok || quotation === undefined) {
          if (active) setError(getMessage(payload) ?? "Unable to load your quotation.");
          return;
        }

        if (quotation && active) {
          setStatus(quotation.status);
          setDeliveryTimeline(quotation.deliveryTimeline ?? "");
          setNotes(quotation.notes ?? "");
          setPrices(
            Object.fromEntries(
              quotation.lineItems.map((lineItem) => [lineItem.rfqLineItemId, lineItem.unitPrice]),
            ),
          );
        }
      } catch {
        if (active) setError("Unable to reach VendorBridge. Please try again.");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadQuotation();
    return () => {
      active = false;
    };
  }, [isQuoteAvailable, rfqId]);

  const draftLineItems = useMemo(
    () => lineItems
      .filter((lineItem) => prices[lineItem.id]?.trim())
      .map((lineItem) => ({ rfqLineItemId: lineItem.id, unitPrice: prices[lineItem.id].trim() })),
    [lineItems, prices],
  );
  const submissionLineItems = useMemo(
    () => lineItems.map((lineItem) => ({
      rfqLineItemId: lineItem.id,
      unitPrice: prices[lineItem.id]?.trim() ?? "",
    })),
    [lineItems, prices],
  );
  const isSubmitted = status === "SUBMITTED";

  async function save(mode: "draft" | "submit") {
    if (isSaving || isSubmitted) return;

    const payload = {
      deliveryTimeline: deliveryTimeline.trim() || undefined,
      notes: notes.trim() || undefined,
      lineItems: mode === "draft" ? draftLineItems : submissionLineItems,
    };
    const validation = (mode === "draft" ? quotationDraftSchema : quotationSubmissionSchema)
      .safeParse(payload);
    if (!validation.success) {
      setSuccess(null);
      setError(
        mode === "submit"
          ? "Enter a valid unit price for every requested line item before submitting."
          : "Enter at least one valid unit price before saving a draft.",
      );
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const response = await fetch(
        mode === "submit"
          ? `/api/rfqs/${rfqId}/quotation/submit`
          : `/api/rfqs/${rfqId}/quotation`,
        {
          method: mode === "submit" ? "POST" : status === "DRAFT" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(validation.data),
        },
      );
      const responsePayload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(getMessage(responsePayload) ?? "Unable to save your quotation.");
        return;
      }

      const nextStatus = mode === "submit" ? "SUBMITTED" : "DRAFT";
      setStatus(nextStatus);
      setSuccess(nextStatus === "SUBMITTED" ? "Quotation submitted." : "Quotation draft saved.");
    } catch {
      setError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isQuoteAvailable === null) {
    return <p className="mt-9 text-sm text-[#c7c7c7]">Checking quotation availability…</p>;
  }

  if (!isQuoteAvailable) {
    return (
      <section aria-labelledby="quotation-unavailable-heading" className="mt-9 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
        <h2 className="text-lg font-medium" id="quotation-unavailable-heading">Quotation unavailable</h2>
        <p className="mt-2 text-sm text-[#c7c7c7]">
          The quotation deadline has passed. You can no longer save or submit a quotation for this RFQ.
        </p>
      </section>
    );
  }

  if (isLoading) {
    return <p className="mt-3 text-sm text-[#c7c7c7]">Loading your quotation…</p>;
  }

  return (
    <section aria-labelledby="quotation-heading" className="mt-9 rounded-[6px] border border-[#777777] bg-[#151515] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium" id="quotation-heading">Your Quotation</h2>
          <p className="mt-1 text-sm text-[#c7c7c7]">
            {isSubmitted ? "Submitted quotation" : status === "DRAFT" ? "Draft quotation" : "No quotation saved yet"}
          </p>
        </div>
        {status ? <span className="rounded border border-[#777777] px-2 py-1 text-xs text-[#d6d6d6]">{status === "SUBMITTED" ? "Submitted" : "Draft"}</span> : null}
      </div>

      {error ? <p className="mt-4 rounded-[4px] border border-[#b86d6d] bg-[#2a1717] p-3 text-sm text-[#f2bbbb]" role="alert">{error}</p> : null}
      {success ? <p className="mt-4 rounded-[4px] border border-[#638d67] bg-[#142418] p-3 text-sm text-[#c8e9ca]" role="status">{success}</p> : null}

      {isSubmitted ? (
        <p className="mt-4 text-sm text-[#c7c7c7]">This quotation is submitted and can no longer be changed.</p>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-[4px] border border-[#666666]">
        <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
          <thead className="border-b border-[#666666] text-xs text-[#bdbdbd]">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Requested</th>
              <th className="w-48 px-3 py-2 font-medium">Unit price ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((lineItem) => (
              <tr className="border-t border-[#454545]" key={lineItem.id}>
                <td className="px-3 py-3 text-[#efefef]">{lineItem.description}</td>
                <td className="px-3 py-3 text-[#d6d6d6]">{lineItem.quantity} {lineItem.unit}</td>
                <td className="p-2">
                  <Input
                    aria-label={`Unit price for ${lineItem.description}`}
                    className="h-9 rounded-[3px] text-sm"
                    disabled={isSubmitted || isSaving}
                    inputMode="decimal"
                    min="0"
                    onChange={(event) => setPrices((current) => ({ ...current, [lineItem.id]: event.target.value }))}
                    placeholder="0.00"
                    step="0.01"
                    type="text"
                    value={prices[lineItem.id] ?? ""}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="delivery-timeline">Delivery timeline</Label>
          <Input
            className="mt-1.5 h-10 rounded-[4px] border-[#747474] bg-[#181818]"
            disabled={isSubmitted || isSaving}
            id="delivery-timeline"
            maxLength={500}
            onChange={(event) => setDeliveryTimeline(event.target.value)}
            placeholder="e.g. Delivered within 10 business days"
            value={deliveryTimeline}
          />
        </div>
        <div>
          <Label htmlFor="quotation-notes">Notes or comments</Label>
          <textarea
            className="mt-1.5 min-h-10 w-full rounded-[4px] border border-[#747474] bg-[#181818] px-3 py-2 text-sm text-[#ededed] placeholder:text-[#898989] focus-visible:border-[#e0e0e0] focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/25 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitted || isSaving}
            id="quotation-notes"
            maxLength={5000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional commercial or delivery notes"
            rows={2}
            value={notes}
          />
        </div>
      </div>

      {!isSubmitted ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Button
            className="h-9 rounded-[4px] border-[#e0e0e0] bg-[#ededed] px-4 text-sm text-[#171717] hover:bg-white"
            disabled={isSaving}
            onClick={() => void save("draft")}
            type="button"
          >
            {isSaving ? "Saving…" : "Save Draft"}
          </Button>
          <Button
            className="h-9 rounded-[4px] px-4 text-sm"
            disabled={isSaving}
            onClick={() => void save("submit")}
            type="button"
            variant="outline"
          >
            {isSaving ? "Saving…" : "Submit Quotation"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
