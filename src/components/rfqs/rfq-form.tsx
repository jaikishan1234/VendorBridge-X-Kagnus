"use client";

import {
  ImageKitInvalidRequestError,
  ImageKitServerError,
  ImageKitUploadNetworkError,
  upload,
} from "@imagekit/javascript";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";
import type { ZodError } from "zod";
import { DeadlinePicker } from "@/components/rfqs/deadline-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_RFQ_ATTACHMENT_SIZE,
  validateAttachmentMetadata,
} from "@/lib/rfq-attachments";
import {
  createRfqSchema,
  rfqCategories,
  type CreateRfqInput,
} from "@/lib/validations/rfq";

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
type RfqFormValues = Omit<
  CreateRfqInput,
  "category" | "lineItems" | "vendorIds"
> & {
  category: "" | (typeof rfqCategories)[number];
  lineItems: RfqLineItemValues[];
  vendorIds: string[];
};
type RfqFieldErrors = Partial<Record<keyof RfqFormValues, string>>;

const initialValues: RfqFormValues = {
  title: "",
  category: "",
  description: "",
  currency: "",
  deadline: "",
  lineItems: [{ description: "", quantity: "", unit: "" }],
  vendorIds: [],
};
const inputClassName =
  "mt-1.5 h-10 rounded-[4px] border border-[#747474] bg-[#181818] px-3 text-sm text-[#ededed] placeholder:text-[#898989] focus-visible:border-[#e0e0e0] focus-visible:ring-[#d8d8d8]/25";

function getFieldErrors(error: ZodError): RfqFieldErrors {
  const fieldErrors: RfqFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (
      (field === "title" ||
        field === "category" ||
        field === "description" ||
        field === "currency" ||
        field === "deadline" ||
        field === "lineItems" ||
        field === "vendorIds") &&
      !fieldErrors[field]
    )
      fieldErrors[field] = issue.message;
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

type UploadAuthentication = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  folder: string;
  fileName: string;
  checks: string;
};

type AttachmentUploadStage = "authorization" | "storage" | "finalization";
type SubmissionIntent = "draft" | "publish";

class AttachmentUploadError extends Error {
  constructor(
    readonly stage: AttachmentUploadStage,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentUploadError";
  }
}

function getSanitizedImageKitUploadMessage(error: unknown): string {
  if (error instanceof ImageKitInvalidRequestError) {
    return "ImageKit rejected the upload request.";
  }

  if (error instanceof ImageKitUploadNetworkError) {
    return "ImageKit upload network request failed.";
  }

  if (error instanceof ImageKitServerError) {
    return "ImageKit upload service returned an error.";
  }

  return "ImageKit upload failed unexpectedly.";
}

function isUploadAuthentication(value: unknown): value is UploadAuthentication {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof value.token === "string" &&
    "expire" in value &&
    typeof value.expire === "number" &&
    "signature" in value &&
    typeof value.signature === "string" &&
    "publicKey" in value &&
    typeof value.publicKey === "string" &&
    "folder" in value &&
    typeof value.folder === "string" &&
    "fileName" in value &&
    typeof value.fileName === "string" &&
    "checks" in value &&
    typeof value.checks === "string"
  );
}

export function RfqForm({ vendors }: { vendors: VendorOption[] }) {
  const router = useRouter();
  const [values, setValues] = useState<RfqFormValues>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<RfqFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionIntent, setSubmissionIntent] = useState<SubmissionIntent>("draft");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showVendorPicker, setShowVendorPicker] = useState(false);
  const [isDraggingAttachment, setIsDraggingAttachment] = useState(false);

  const selectedVendors = vendors.filter((vendor) =>
    values.vendorIds.includes(vendor.id),
  );
  const availableVendors = vendors.filter(
    (vendor) => !values.vendorIds.includes(vendor.id),
  );

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
      lineItems: [
        ...current.lineItems,
        { description: "", quantity: "", unit: "" },
      ],
    }));
  }
  function removeLineItem(index: number) {
    setValues((current) => ({
      ...current,
      lineItems: current.lineItems.filter(
        (_, lineIndex) => lineIndex !== index,
      ),
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
  function updateAttachments(files: Iterable<File>) {
    const selectedFiles = Array.from(files);
    const invalid = selectedFiles
      .map((file) =>
        validateAttachmentMetadata({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      )
      .find(Boolean);
    if (invalid) {
      setAttachmentError(invalid);
      return;
    }
    setAttachments(selectedFiles);
    setAttachmentError(null);
  }
  function handleAttachmentDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDraggingAttachment(false);
    updateAttachments(event.dataTransfer.files);
  }

  async function uploadAttachment(rfqId: string, file: File): Promise<void> {
    const authResponse = await fetch(
      `/api/rfqs/${rfqId}/attachments/upload-auth`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      },
    );
    const authPayload: unknown = await authResponse.json().catch(() => null);
    if (!authResponse.ok || !isUploadAuthentication(authPayload))
      throw new AttachmentUploadError(
        "authorization",
        `Attachment upload authorization returned ${authResponse.status}.`,
      );
    const uploadResult = await upload({
      file,
      fileName: authPayload.fileName,
      folder: authPayload.folder,
      isPrivateFile: true,
      useUniqueFileName: false,
      overwriteFile: false,
      checks: authPayload.checks,
      token: authPayload.token,
      expire: authPayload.expire,
      signature: authPayload.signature,
      publicKey: authPayload.publicKey,
      responseFields: ["isPrivateFile"],
    }).catch((error: unknown) => {
      throw new AttachmentUploadError(
        "storage",
        getSanitizedImageKitUploadMessage(error),
      );
    });
    if (!uploadResult.fileId)
      throw new AttachmentUploadError(
        "storage",
        "ImageKit did not return an attachment reference.",
      );
    const attachmentResponse = await fetch(`/api/rfqs/${rfqId}/attachments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ fileId: uploadResult.fileId }),
    });
    if (!attachmentResponse.ok)
      throw new AttachmentUploadError(
        "finalization",
        `Attachment finalization returned ${attachmentResponse.status}.`,
      );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent: SubmissionIntent =
      submitter instanceof HTMLButtonElement && submitter.value === "publish"
        ? "publish"
        : "draft";
    const result = createRfqSchema.safeParse(values);
    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error));
      setFormError("Review the highlighted fields and try again.");
      return;
    }
    setFieldErrors({});
    setFormError(null);
    const attachmentValidation = attachments
      .map((file) =>
        validateAttachmentMetadata({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        }),
      )
      .find(Boolean);
    if (attachmentValidation) {
      setAttachmentError(attachmentValidation);
      return;
    }
    setIsSubmitting(true);
    setSubmissionIntent(intent);
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
      const results = await Promise.allSettled(
        attachments.map((attachment) => uploadAttachment(rfqId, attachment)),
      );
      const failedUploads = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failedUploads.length > 0) {
        console.error(
          "RFQ attachment upload failed.",
          failedUploads.map((result) =>
            result.reason instanceof AttachmentUploadError
              ? { stage: result.reason.stage, message: result.reason.message }
              : { stage: "unknown", message: "Attachment upload failed unexpectedly." },
          ),
        );
        router.replace(`/rfqs/${rfqId}?attachmentUpload=partial`);
        return;
      }
      if (intent === "publish") {
        const publishResponse = await fetch(`/api/rfqs/${rfqId}/publish`, {
          method: "POST",
          credentials: "same-origin",
        });
        if (!publishResponse.ok) {
          router.replace(`/rfqs/${rfqId}?publication=failed`);
          return;
        }
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
      className="mt-6 w-full min-w-0 max-w-full rounded-[5px] border border-[#6f6f6f] bg-[#151515] p-4 sm:p-5 xl:max-w-6xl"
      noValidate
      onSubmit={handleSubmit}
    >
      <ol
        aria-label="RFQ creation progress"
        className="mx-auto flex max-w-md items-center px-1 pb-7"
      >
        {[1, 2, 3].map((step, index) => (
          <li className="flex flex-1 items-center last:flex-none" key={step}>
            <span
              aria-current={step === 1 ? "step" : undefined}
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs ${step === 1 ? "border-[#e1e1e1] bg-[#ededed] text-[#171717]" : "border-[#777777] text-[#d7d7d7]"}`}
            >
              {step}
            </span>
            {index < 2 ? (
              <span
                aria-hidden="true"
                className="mx-2 h-px flex-1 bg-[#6e6e6e]"
              />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-label="RFQ details" className="min-w-0 space-y-4">
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
            {fieldErrors.title ? (
              <p className="mt-1 text-xs text-[#f19a9a]" id="title-error">
                {fieldErrors.title}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="category">RFQ Category</Label>
              <select
                aria-describedby={
                  fieldErrors.category ? "category-error" : undefined
                }
                aria-invalid={Boolean(fieldErrors.category)}
                className={`${inputClassName} w-full`}
                disabled={isSubmitting}
                id="category"
                onChange={(event) => updateField("category", event.target.value)}
                required
                value={values.category}
              >
                <option disabled value="">Select a category</option>
                {rfqCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              {fieldErrors.category ? (
                <p className="mt-1 text-xs text-[#f19a9a]" id="category-error">
                  {fieldErrors.category}
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                aria-describedby={
                  fieldErrors.currency ? "currency-error" : undefined
                }
                aria-invalid={Boolean(fieldErrors.currency)}
                className={inputClassName}
                disabled={isSubmitting}
                id="currency"
                maxLength={3}
                onChange={(event) =>
                  updateField("currency", event.target.value.toUpperCase())
                }
                placeholder="USD"
                required
                value={values.currency}
              />
              {fieldErrors.currency ? (
                <p className="mt-1 text-xs text-[#f19a9a]" id="currency-error">
                  {fieldErrors.currency}
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <Label htmlFor="deadline">Deadline</Label>
            <DeadlinePicker
              describedBy={fieldErrors.deadline ? "deadline-error" : undefined}
              disabled={isSubmitting}
              id="deadline"
              invalid={Boolean(fieldErrors.deadline)}
              onChange={(value) => updateField("deadline", value)}
              value={values.deadline}
            />
            {fieldErrors.deadline ? (
              <p className="mt-1 text-xs text-[#f19a9a]" id="deadline-error">
                {fieldErrors.deadline}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <textarea
              aria-describedby={
                fieldErrors.description ? "description-error" : undefined
              }
              aria-invalid={Boolean(fieldErrors.description)}
              className="mt-1.5 min-h-28 w-full rounded-[4px] border border-[#747474] bg-[#181818] px-3 py-2.5 text-sm text-[#ededed] placeholder:text-[#898989] focus-visible:border-[#e0e0e0] focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/25 focus-visible:outline-none"
              disabled={isSubmitting}
              id="description"
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              required
              value={values.description}
            />
            {fieldErrors.description ? (
              <p className="mt-1 text-xs text-[#f19a9a]" id="description-error">
                {fieldErrors.description}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="line-items-heading" className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2
              className="text-sm font-medium text-[#efefef]"
              id="line-items-heading"
            >
              Line items
            </h2>
            <Button
              className="h-8 rounded-[4px] border-[#777777] px-3 text-xs"
              disabled={isSubmitting}
              onClick={addLineItem}
              type="button"
              variant="outline"
            >
              + Add line item
            </Button>
          </div>
          {fieldErrors.lineItems ? (
            <p className="mt-2 text-xs text-[#f19a9a]">
              {fieldErrors.lineItems}
            </p>
          ) : null}
          <div className="mt-3 min-w-0 overflow-x-auto rounded-[4px] border border-[#666666]">
            <table className="w-full min-w-[34rem] table-fixed border-collapse text-left text-sm lg:min-w-0">
              <thead className="border-b border-[#666666] text-xs text-[#bdbdbd]">
                <tr>
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="w-24 px-3 py-2 font-medium">Quantity</th>
                  <th className="w-28 px-3 py-2 font-medium">Unit</th>
                  <th className="w-10 px-2 py-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {values.lineItems.map((lineItem, index) => (
                  <tr className="border-t border-[#454545]" key={index}>
                    <td className="p-2">
                      <Input
                        aria-label={`Item ${index + 1}`}
                        className="h-8 rounded-[3px] px-2 text-xs"
                        disabled={isSubmitting}
                        onChange={(event) =>
                          updateLineItem(
                            index,
                            "description",
                            event.target.value,
                          )
                        }
                        value={lineItem.description}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        aria-label={`Quantity ${index + 1}`}
                        className="h-8 rounded-[3px] px-2 text-xs"
                        disabled={isSubmitting}
                        min="0.001"
                        onChange={(event) =>
                          updateLineItem(index, "quantity", event.target.value)
                        }
                        step="0.001"
                        type="number"
                        value={lineItem.quantity}
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        aria-label={`Unit ${index + 1}`}
                        className="h-8 rounded-[3px] px-2 text-xs"
                        disabled={isSubmitting}
                        onChange={(event) =>
                          updateLineItem(index, "unit", event.target.value)
                        }
                        value={lineItem.unit}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        aria-label={`Remove item ${index + 1}`}
                        className="grid h-7 w-7 place-items-center rounded border border-[#777777] text-[#d6d6d6] hover:bg-[#2a2a2a] disabled:opacity-50"
                        disabled={isSubmitting || values.lineItems.length === 1}
                        onClick={() => removeLineItem(index)}
                        type="button"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section aria-labelledby="vendors-heading" className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <h2
                className="text-sm font-medium text-[#efefef]"
                id="vendors-heading"
              >
                Assign vendors
              </h2>
              <Button
                className="h-8 rounded-[4px] border-[#777777] px-3 text-xs"
                disabled={isSubmitting || vendors.length === 0}
                onClick={() => setShowVendorPicker((current) => !current)}
                type="button"
                variant="outline"
              >
                + Add vendor
              </Button>
            </div>
            {fieldErrors.vendorIds ? (
              <p className="mt-2 text-xs text-[#f19a9a]">
                {fieldErrors.vendorIds}
              </p>
            ) : null}
            <div className="mt-3 flex min-h-12 flex-wrap gap-2 rounded-[4px] border border-[#666666] p-2">
              {selectedVendors.length === 0 ? (
                <p className="p-1 text-xs text-[#a8a8a8]">
                  No vendors selected.
                </p>
              ) : (
                selectedVendors.map((vendor) => (
                  <span
                    className="inline-flex h-8 items-center gap-2 rounded-[3px] border border-[#777777] px-2 text-xs text-[#ededed]"
                    key={vendor.id}
                  >
                    {vendor.vendorName}
                    <button
                      aria-label={`Remove ${vendor.vendorName}`}
                      className="text-[#bdbdbd] hover:text-white"
                      disabled={isSubmitting}
                      onClick={() => toggleVendor(vendor.id)}
                      type="button"
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            {showVendorPicker ? (
              <div className="mt-2 grid gap-2 rounded-[4px] border border-[#666666] p-2 sm:grid-cols-2">
                {availableVendors.length === 0 ? (
                  <p className="p-1 text-xs text-[#a8a8a8]">
                    No available vendors.
                  </p>
                ) : (
                  availableVendors.map((vendor) => (
                    <button
                      className="rounded-[3px] border border-[#5e5e5e] px-2 py-2 text-left text-xs text-[#e8e8e8] hover:bg-[#252525]"
                      disabled={isSubmitting}
                      key={vendor.id}
                      onClick={() => toggleVendor(vendor.id)}
                      type="button"
                    >
                      <span className="block font-medium">
                        {vendor.vendorName}
                      </span>
                      <span className="mt-1 block text-[#a8a8a8]">
                        {vendor.category} · {vendor.status.toLowerCase()}
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </section>
        </section>
      </div>

      <div className="mt-7 min-w-0 border-t border-[#666666] pt-5">
        <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-end">
          <div className="min-w-0">
            {formError ? (
              <p className="mb-3 text-sm text-[#f19a9a]" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="h-9 rounded-[4px] border-[#e0e0e0] bg-[#ededed] px-4 text-sm text-[#171717] hover:bg-white"
                disabled={isSubmitting || vendors.length === 0}
                name="intent"
                type="submit"
                value="draft"
              >
                {isSubmitting && submissionIntent === "draft" ? "Saving..." : "Save as Draft"}
              </Button>
              <Button
                className="h-9 rounded-[4px] px-4 text-sm"
                disabled={isSubmitting || vendors.length === 0}
                name="intent"
                type="submit"
                value="publish"
                variant="outline"
              >
                {isSubmitting && submissionIntent === "publish" ? "Publishing..." : "Publish RFQ"}
              </Button>
              <Link
                className="text-sm text-[#c7c7c7] underline-offset-4 hover:text-[#efefef] hover:underline"
                href="/rfqs"
              >
                Cancel
              </Link>
            </div>
            <p className="mt-3 text-xs text-[#a8a8a8]">
              Publishing makes the RFQ available to assigned vendors. Vendor notifications are not sent automatically.
            </p>
          </div>
          <div className="min-w-0">
            <Label className="sr-only" htmlFor="attachments">
              Attachments
            </Label>
            <label
              className={`block cursor-pointer rounded-[4px] border border-dashed p-4 text-center transition-colors ${isDraggingAttachment ? "border-[#e0e0e0] bg-[#252525]" : "border-[#777777] hover:border-[#bdbdbd]"}`}
              htmlFor="attachments"
              onDragLeave={() => setIsDraggingAttachment(false)}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingAttachment(true);
              }}
              onDrop={handleAttachmentDrop}
            >
              <span className="block text-sm text-[#e8e8e8]">
                Drop attachments here or browse
              </span>
              <span className="mt-1 block text-xs text-[#a8a8a8]">
                PDF, DOCX, XLSX, CSV, PNG, JPG ·{" "}
                {MAX_RFQ_ATTACHMENT_SIZE / 1024 / 1024} MB max each
              </span>
              <input
                accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg"
                aria-describedby={
                  attachmentError ? "attachments-error" : undefined
                }
                aria-invalid={Boolean(attachmentError)}
                className="sr-only"
                disabled={isSubmitting}
                id="attachments"
                multiple
                onChange={(event) =>
                  updateAttachments(event.target.files ?? [])
                }
                type="file"
              />
            </label>
            {attachments.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-[#d6d6d6]">
                {attachments.map((attachment) => (
                  <li key={`${attachment.name}-${attachment.lastModified}`}>
                    {attachment.name}
                  </li>
                ))}
              </ul>
            ) : null}
            {attachmentError ? (
              <p className="mt-2 text-xs text-[#f19a9a]" id="attachments-error">
                {attachmentError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
