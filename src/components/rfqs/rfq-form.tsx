"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ZodError } from "zod";
import { DeadlinePicker } from "@/components/rfqs/deadline-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRfqSchema, type CreateRfqInput } from "@/lib/validations/rfq";

type VendorOption = {
  id: string;
  vendorName: string;
  category: string;
  status: string;
};

type RfqLineItemValues = {
  description: string;
  quantity: string;
  unit: string;
};

type RfqFormValues = Omit<CreateRfqInput, "lineItems" | "vendorIds"> & {
  lineItems: RfqLineItemValues[];
  vendorIds: string[];
};

type RfqFieldErrors = Partial<Record<keyof RfqFormValues, string>>;

const initialValues: RfqFormValues = {
  title: "",
  description: "",
  currency: "",
  deadline: "",
  lineItems: [{ description: "", quantity: "", unit: "" }],
  vendorIds: [],
};

const inputClassName =
  "mt-2 h-11 rounded-[5px] border border-[#777777] bg-transparent px-4 text-sm text-[#ededed] placeholder:text-[#a8a8a8] focus-visible:border-[#e0e0e0] focus-visible:ring-[#d8d8d8]/25 dark:bg-transparent";

function getFieldErrors(error: ZodError): RfqFieldErrors {
  const fieldErrors: RfqFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (
      (field === "title" ||
        field === "description" ||
        field === "currency" ||
        field === "deadline" ||
        field === "lineItems" ||
        field === "vendorIds") &&
      !fieldErrors[field]
    ) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

function getResponseMessage(payload: unknown): string | undefined {
  return typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
    ? payload.message
    : undefined;
}

function getRfqId(payload: unknown): string | undefined {
  return typeof payload === "object" &&
    payload !== null &&
    "rfq" in payload &&
    typeof payload.rfq === "object" &&
    payload.rfq !== null &&
    "id" in payload.rfq &&
    typeof payload.rfq.id === "string"
    ? payload.rfq.id
    : undefined;
}

export function RfqForm({ vendors }: { vendors: VendorOption[] }) {
  const router = useRouter();
  const [values, setValues] = useState<RfqFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<RfqFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(
    field: Exclude<keyof RfqFormValues, "lineItems" | "vendorIds">,
    value: string,
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  function updateLineItem(
    index: number,
    field: keyof RfqLineItemValues,
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      lineItems: current.lineItems.map((lineItem, lineIndex) =>
        lineIndex === index ? { ...lineItem, [field]: value } : lineItem,
      ),
    }));
    setFieldErrors((current) => ({ ...current, lineItems: undefined }));
    setFormError(null);
  }

  function addLineItem() {
    setValues((current) => ({
      ...current,
      lineItems: [...current.lineItems, { description: "", quantity: "", unit: "" }],
    }));
  }

  function removeLineItem(index: number) {
    setValues((current) => ({
      ...current,
      lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  function toggleVendor(vendorId: string) {
    setValues((current) => ({
      ...current,
      vendorIds: current.vendorIds.includes(vendorId)
        ? current.vendorIds.filter((id) => id !== vendorId)
        : [...current.vendorIds, vendorId],
    }));
    setFieldErrors((current) => ({ ...current, vendorIds: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    const result = createRfqSchema.safeParse(values);

    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error));
      setFormError("Review the highlighted fields and try again.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(result.data),
      });
      const responsePayload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(
          getResponseMessage(responsePayload) ??
            "We could not create this RFQ. Please try again.",
        );
        return;
      }

      const rfqId = getRfqId(responsePayload);

      if (!rfqId) {
        setFormError("RFQ saved, but its details could not be opened.");
        return;
      }

      router.replace(`/rfqs/${rfqId}`);
    } catch {
      setFormError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="mt-7 max-w-5xl rounded-[6px] border border-[#777777] bg-[#151515] p-5 sm:p-6"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="title">RFQ Title</Label>
          <Input
            aria-describedby={fieldErrors.title ? "title-error" : undefined}
            aria-invalid={Boolean(fieldErrors.title)}
            className={inputClassName}
            disabled={isSubmitting}
            id="title"
            onChange={(event) => updateField("title", event.target.value)}
            required
            value={values.title}
          />
          {fieldErrors.title ? <p className="mt-1 text-xs text-[#f19a9a]" id="title-error">{fieldErrors.title}</p> : null}
        </div>

        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            aria-describedby={fieldErrors.currency ? "currency-error" : undefined}
            aria-invalid={Boolean(fieldErrors.currency)}
            className={inputClassName}
            disabled={isSubmitting}
            id="currency"
            maxLength={3}
            onChange={(event) => updateField("currency", event.target.value.toUpperCase())}
            placeholder="USD"
            required
            value={values.currency}
          />
          {fieldErrors.currency ? <p className="mt-1 text-xs text-[#f19a9a]" id="currency-error">{fieldErrors.currency}</p> : null}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="description">Product or Service Details</Label>
          <textarea
            aria-describedby={fieldErrors.description ? "description-error" : undefined}
            aria-invalid={Boolean(fieldErrors.description)}
            className="mt-2 min-h-28 w-full rounded-[5px] border border-[#777777] bg-transparent px-4 py-3 text-sm text-[#ededed] placeholder:text-[#a8a8a8] focus-visible:border-[#e0e0e0] focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/25 focus-visible:outline-none"
            disabled={isSubmitting}
            id="description"
            onChange={(event) => updateField("description", event.target.value)}
            required
            value={values.description}
          />
          {fieldErrors.description ? <p className="mt-1 text-xs text-[#f19a9a]" id="description-error">{fieldErrors.description}</p> : null}
        </div>

        <div>
          <Label htmlFor="deadline">Quotation Deadline</Label>
          <DeadlinePicker
            describedBy={fieldErrors.deadline ? "deadline-error" : undefined}
            disabled={isSubmitting}
            id="deadline"
            invalid={Boolean(fieldErrors.deadline)}
            onChange={(value) => updateField("deadline", value)}
            value={values.deadline}
          />
          {fieldErrors.deadline ? <p className="mt-1 text-xs text-[#f19a9a]" id="deadline-error">{fieldErrors.deadline}</p> : null}
        </div>
      </div>

      <section aria-labelledby="line-items-heading" className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-medium" id="line-items-heading">Line Items</h2>
            <p className="mt-1 text-sm text-[#c7c7c7]">Describe the products or services requested.</p>
          </div>
          <Button disabled={isSubmitting} onClick={addLineItem} type="button" variant="outline">Add Line Item</Button>
        </div>
        {fieldErrors.lineItems ? <p className="mt-2 text-xs text-[#f19a9a]">{fieldErrors.lineItems}</p> : null}
        <div className="mt-4 space-y-3">
          {values.lineItems.map((lineItem, index) => (
            <div className="grid gap-3 rounded-[5px] border border-[#545454] p-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]" key={index}>
              <div>
                <Label htmlFor={`line-description-${index}`}>Description</Label>
                <Input className={inputClassName} disabled={isSubmitting} id={`line-description-${index}`} onChange={(event) => updateLineItem(index, "description", event.target.value)} required value={lineItem.description} />
              </div>
              <div>
                <Label htmlFor={`line-quantity-${index}`}>Quantity</Label>
                <Input className={inputClassName} disabled={isSubmitting} id={`line-quantity-${index}`} min="0.001" onChange={(event) => updateLineItem(index, "quantity", event.target.value)} required step="0.001" type="number" value={lineItem.quantity} />
              </div>
              <div>
                <Label htmlFor={`line-unit-${index}`}>Unit</Label>
                <Input className={inputClassName} disabled={isSubmitting} id={`line-unit-${index}`} onChange={(event) => updateLineItem(index, "unit", event.target.value)} placeholder="Each" required value={lineItem.unit} />
              </div>
              <div className="flex items-end">
                <Button disabled={isSubmitting || values.lineItems.length === 1} onClick={() => removeLineItem(index)} type="button" variant="outline">Remove</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="vendors-heading" className="mt-8">
        <h2 className="text-base font-medium" id="vendors-heading">Assigned Vendors</h2>
        <p className="mt-1 text-sm text-[#c7c7c7]">Select the registered vendors invited to quote.</p>
        {fieldErrors.vendorIds ? <p className="mt-2 text-xs text-[#f19a9a]">{fieldErrors.vendorIds}</p> : null}
        {vendors.length === 0 ? (
          <p className="mt-4 rounded-[5px] border border-[#777777] p-4 text-sm text-[#c7c7c7]">No registered vendors are available. Add a vendor before creating an RFQ.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {vendors.map((vendor) => (
              <label className="flex cursor-pointer items-start gap-3 rounded-[5px] border border-[#545454] p-4 text-sm text-[#e8e8e8]" key={vendor.id}>
                <input checked={values.vendorIds.includes(vendor.id)} disabled={isSubmitting} onChange={() => toggleVendor(vendor.id)} type="checkbox" value={vendor.id} />
                <span>
                  <span className="block font-medium">{vendor.vendorName}</span>
                  <span className="mt-1 block text-xs text-[#b7b7b7]">{vendor.category} · {vendor.status.toLowerCase()}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {formError ? <p className="mt-5 text-sm text-[#f19a9a]" role="alert">{formError}</p> : null}

      <div className="mt-7 flex flex-wrap gap-3">
        <Button className="h-10 rounded-[5px] border-[#8a8a8a] bg-transparent px-5 text-[#efefef] hover:border-[#d4d4d4] hover:bg-[#252525] dark:border-[#8a8a8a] dark:bg-transparent dark:text-[#efefef] dark:hover:bg-[#252525]" disabled={isSubmitting || vendors.length === 0} type="submit" variant="outline">
          {isSubmitting ? "Creating..." : "Create RFQ"}
        </Button>
        <Link className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#6e6e6e] px-5 text-sm text-[#d6d6d6] transition-colors hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50" href="/rfqs">Cancel</Link>
      </div>
    </form>
  );
}
