import { describe, expect, it } from "vitest";
import { MAX_RFQ_ATTACHMENT_SIZE, validateAttachmentMetadata } from "@/lib/rfq-attachments";

describe("RFQ attachment validation", () => {
  it("accepts the supported types only when their extension and MIME type agree", () => {
    expect(validateAttachmentMetadata({
      filename: "scope-of-work.pdf",
      mimeType: "application/pdf",
      size: 1024,
    })).toBeUndefined();

    expect(validateAttachmentMetadata({
      filename: "malware.exe",
      mimeType: "application/pdf",
      size: 1024,
    })).toBe("Attachments must be PDF, DOCX, XLSX, CSV, PNG, or JPG files.");
  });

  it("enforces the 10 MB per-file server limit", () => {
    expect(validateAttachmentMetadata({
      filename: "pricing.csv",
      mimeType: "text/csv",
      size: MAX_RFQ_ATTACHMENT_SIZE + 1,
    })).toBe("Each attachment must be 10 MB or smaller.");
  });
});
