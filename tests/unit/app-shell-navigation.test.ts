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
    expect(navigationItemsForRole("VENDOR")).not.toContain("Approvals");
  });

  it("keeps procurement quotation navigation on the comparison landing page", () => {
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Quotations");
    expect(navigationHref("Quotations", "PROCUREMENT_OFFICER")).toBe("/quotations");
    expect(navigationLabel("Quotations", "PROCUREMENT_OFFICER")).toBe("Quotations");
  });

  it("exposes Purchase Orders only to procurement officers and vendors", () => {
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Purchase Orders");
    expect(navigationHref("Purchase Orders", "PROCUREMENT_OFFICER")).toBe("/purchase-orders");
    expect(navigationItemsForRole("VENDOR")).toContain("Purchase Orders");
    expect(navigationHref("Purchase Orders", "VENDOR")).toBe("/purchase-orders");
  });

  it("does not expose the quotations navigation to unsupported roles", () => {
    expect(navigationItemsForRole("MANAGER")).not.toContain("Quotations");
    expect(navigationItemsForRole("MANAGER")).not.toContain("Purchase Orders");
    expect(navigationItemsForRole("ADMIN")).not.toContain("Purchase Orders");
    expect(navigationHref("Approvals", "MANAGER")).toBe("/approvals");
  });
});
