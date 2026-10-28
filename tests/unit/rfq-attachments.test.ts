import { describe, expect, it } from "vitest";
import {
  attachmentContentDisposition,
  MAX_RFQ_ATTACHMENT_SIZE,
  validateAttachmentMetadata,
} from "@/lib/rfq-attachments";

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

  it("uses a safe RFC 5987 filename for attachment responses", () => {
    expect(attachmentContentDisposition("supplier's scope & quote.final.png")).toBe(
      "attachment; filename=\"supplier's scope & quote.final.png\"; filename*=UTF-8''supplier%27s%20scope%20%26%20quote.final.png",
    );
    expect(attachmentContentDisposition('report\"\r\n.pdf')).toBe(
      "attachment; filename=\"report___.pdf\"; filename*=UTF-8''report%22%0D%0A.pdf",
    );
  });
});
