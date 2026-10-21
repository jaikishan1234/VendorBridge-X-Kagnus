"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { ZodError } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVendorSchema } from "@/lib/validations/vendor";

type VendorValues = {
  vendorName: string;
  category: string;
  gstNumber: string;
  contactName: string;
  email: string;
  phoneNumber: string;
};

type VendorFieldErrors = Partial<Record<keyof VendorValues, string>>;

const initialValues: VendorValues = {
  vendorName: "",
  category: "",
  gstNumber: "",
  contactName: "",
  email: "",
  phoneNumber: "",
};

const inputClassName =
  "mt-2 h-11 rounded-[5px] border border-[#777777] bg-transparent px-4 text-sm text-[#ededed] placeholder:text-[#a8a8a8] focus-visible:border-[#e0e0e0] focus-visible:ring-[#d8d8d8]/25 dark:bg-transparent";

function getFieldErrors(error: ZodError): VendorFieldErrors {
  const fieldErrors: VendorFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (
      (field === "vendorName" ||
        field === "category" ||
        field === "gstNumber" ||
        field === "contactName" ||
        field === "email" ||
        field === "phoneNumber") &&
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

function getVendorId(payload: unknown): string | undefined {
  return typeof payload === "object" &&
    payload !== null &&
    "vendor" in payload &&
    typeof payload.vendor === "object" &&
    payload.vendor !== null &&
    "id" in payload.vendor &&
    typeof payload.vendor.id === "string"
    ? payload.vendor.id
    : undefined;
}

export function VendorForm() {
  const router = useRouter();
  const [values, setValues] = useState<VendorValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<VendorFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof VendorValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) return;

    const result = createVendorSchema.safeParse(values);

    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error));
      setFormError("Review the highlighted fields and try again.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(result.data),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(
          getResponseMessage(payload) ??
            "We could not add this vendor. Please try again.",
        );
        return;
      }

      const vendorId = getVendorId(payload);

      if (!vendorId) {
        setFormError("Vendor saved, but its details could not be opened.");
        return;
      }

      router.replace(`/vendors/${vendorId}`);
    } catch {
      setFormError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="mt-7 max-w-3xl rounded-[6px] border border-[#777777] bg-[#151515] p-5 sm:p-6"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="vendorName">Vendor Name</Label>
          <Input
            aria-describedby={fieldErrors.vendorName ? "vendorName-error" : undefined}
            aria-invalid={Boolean(fieldErrors.vendorName)}
            className={inputClassName}
            disabled={isSubmitting}
            id="vendorName"
            name="vendorName"
            onChange={(event) => updateField("vendorName", event.target.value)}
            required
            value={values.vendorName}
          />
          {fieldErrors.vendorName ? (
            <p className="mt-1 text-xs text-[#f19a9a]" id="vendorName-error">
              {fieldErrors.vendorName}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="category">Category</Label>
          <Input
            aria-describedby={fieldErrors.category ? "category-error" : undefined}
            aria-invalid={Boolean(fieldErrors.category)}
            className={inputClassName}
            disabled={isSubmitting}
            id="category"
            name="category"
            onChange={(event) => updateField("category", event.target.value)}
            required
            value={values.category}
          />
          {fieldErrors.category ? (
            <p className="mt-1 text-xs text-[#f19a9a]" id="category-error">
              {fieldErrors.category}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="gstNumber">
            GST Number <span className="text-[#a8a8a8]">(optional)</span>
          </Label>
          <Input
            aria-describedby={fieldErrors.gstNumber ? "gstNumber-error" : undefined}
            aria-invalid={Boolean(fieldErrors.gstNumber)}
            className={inputClassName}
            disabled={isSubmitting}
            id="gstNumber"
            name="gstNumber"
            onChange={(event) => updateField("gstNumber", event.target.value)}
            value={values.gstNumber}
          />
          {fieldErrors.gstNumber ? (
            <p className="mt-1 text-xs text-[#f19a9a]" id="gstNumber-error">
              {fieldErrors.gstNumber}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="contactName">Contact Name</Label>
          <Input
            aria-describedby={fieldErrors.contactName ? "contactName-error" : undefined}
            aria-invalid={Boolean(fieldErrors.contactName)}
            className={inputClassName}
            disabled={isSubmitting}
            id="contactName"
            name="contactName"
            onChange={(event) => updateField("contactName", event.target.value)}
            required
            value={values.contactName}
          />
          {fieldErrors.contactName ? (
            <p className="mt-1 text-xs text-[#f19a9a]" id="contactName-error">
              {fieldErrors.contactName}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            aria-invalid={Boolean(fieldErrors.email)}
            autoComplete="email"
            className={inputClassName}
            disabled={isSubmitting}
            id="email"
            name="email"
            onChange={(event) => updateField("email", event.target.value)}
            required
            type="email"
            value={values.email}
          />
          {fieldErrors.email ? (
            <p className="mt-1 text-xs text-[#f19a9a]" id="email-error">
              {fieldErrors.email}
            </p>
          ) : null}
        </div>

        <div>
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input
            aria-describedby={fieldErrors.phoneNumber ? "phoneNumber-error" : undefined}
            aria-invalid={Boolean(fieldErrors.phoneNumber)}
            autoComplete="tel"
            className={inputClassName}
            disabled={isSubmitting}
            id="phoneNumber"
            name="phoneNumber"
            onChange={(event) => updateField("phoneNumber", event.target.value)}
            required
            type="tel"
            value={values.phoneNumber}
          />
          {fieldErrors.phoneNumber ? (
            <p className="mt-1 text-xs text-[#f19a9a]" id="phoneNumber-error">
              {fieldErrors.phoneNumber}
            </p>
          ) : null}
        </div>
      </div>

      {formError ? (
        <p className="mt-5 text-sm text-[#f19a9a]" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap gap-3">
        <Button
          className="h-10 rounded-[5px] border-[#8a8a8a] bg-transparent px-5 text-[#efefef] hover:border-[#d4d4d4] hover:bg-[#252525] dark:border-[#8a8a8a] dark:bg-transparent dark:text-[#efefef] dark:hover:bg-[#252525]"
          disabled={isSubmitting}
          type="submit"
          variant="outline"
        >
          {isSubmitting ? "Saving..." : "Save Vendor"}
        </Button>
        <Link
          className="inline-flex h-10 items-center justify-center rounded-[5px] border border-[#6e6e6e] px-5 text-sm text-[#d6d6d6] transition-colors hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
          href="/vendors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
