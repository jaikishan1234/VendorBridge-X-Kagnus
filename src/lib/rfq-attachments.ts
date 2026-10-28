const maximumFilenameLength = 200;

export const MAX_RFQ_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export const IMAGEKIT_RFQ_ATTACHMENT_SIZE_CHECK = '"file.size" <= "10MB"';

const allowedAttachmentTypes = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
} as const;

export type AllowedAttachmentMimeType =
  (typeof allowedAttachmentTypes)[keyof typeof allowedAttachmentTypes];

function getExtension(filename: string): string | undefined {
  const extension = filename.trim().toLowerCase().split(".").pop();
  return extension && extension !== filename.toLowerCase() ? extension : undefined;
}

export function isAllowedAttachment(
  filename: string,
  mimeType: string,
): mimeType is AllowedAttachmentMimeType {
  const extension = getExtension(filename);
  return Boolean(extension && allowedAttachmentTypes[extension as keyof typeof allowedAttachmentTypes] === mimeType);
}

export function validateAttachmentMetadata(input: {
  filename: string;
  mimeType: string;
  size: number;
}): string | undefined {
  const filename = input.filename.trim();

  if (!filename || filename.length > maximumFilenameLength || /[\\/\0]/.test(filename)) {
    return "Use a valid attachment filename.";
  }

  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_RFQ_ATTACHMENT_SIZE) {
    return "Each attachment must be 10 MB or smaller.";
  }

  if (!isAllowedAttachment(filename, input.mimeType)) {
    return "Attachments must be PDF, DOCX, XLSX, CSV, PNG, or JPG files.";
  }
}

export function attachmentFolder(rfqId: string): string {
  return `/vendorbridge/rfqs/${rfqId}`;
}

export function storageFilename(originalFilename: string, nonce: string): string {
  const extension = getExtension(originalFilename);
  const stem = originalFilename
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "attachment";

  return `${nonce}--${stem}.${extension}`;
}

export function originalFilenameFromStorageName(storageName: string): string | undefined {
  const separator = storageName.indexOf("--");
  if (separator < 1) return undefined;

  const filename = storageName.slice(separator + 2);
  return filename && filename.length <= maximumFilenameLength ? filename : undefined;
}
