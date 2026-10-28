import { describe, expect, it } from "vitest";
import { isImageKitDeliveryUrl } from "@/lib/imagekit";

describe("isImageKitDeliveryUrl", () => {
  const endpoint = "https://ik.imagekit.io/vendorbridge";

  it("accepts a signed URL generated beneath the configured endpoint", () => {
    expect(
      isImageKitDeliveryUrl(
        "https://ik.imagekit.io/vendorbridge/rfqs/attachment.png?tr=orig-true&ik-t=1&ik-s=signature",
        endpoint,
      ),
    ).toBe(true);
  });

  it.each([
    "https://untrusted.example.test/file.png",
    "https://ik.imagekit.io/another-endpoint/file.png",
    "http://ik.imagekit.io/vendorbridge/file.png",
    "https://ik.imagekit.io/vendorbridge.evil/file.png",
  ])("rejects an untrusted delivery URL", (url) => {
    expect(isImageKitDeliveryUrl(url, endpoint)).toBe(false);
  });
});
