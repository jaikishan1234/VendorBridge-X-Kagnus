import { describe, expect, it } from "vitest";
import {
  navigationHref,
  navigationItemsForRole,
  navigationLabel,
} from "@/components/app-shell";

describe("application-shell quotation navigation", () => {
  it("routes vendors to their own quotations page with a vendor-specific label", () => {
    expect(navigationItemsForRole("VENDOR")).toContain("Quotations");
    expect(navigationHref("Quotations", "VENDOR")).toBe("/my-quotations");
    expect(navigationLabel("Quotations", "VENDOR")).toBe("My Quotations");
  });

  it("keeps procurement quotation navigation on the comparison landing page", () => {
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Quotations");
    expect(navigationHref("Quotations", "PROCUREMENT_OFFICER")).toBe("/quotations");
    expect(navigationLabel("Quotations", "PROCUREMENT_OFFICER")).toBe("Quotations");
  });

  it("does not expose the quotations navigation to unsupported roles", () => {
    expect(navigationItemsForRole("MANAGER")).not.toContain("Quotations");
  });
});
