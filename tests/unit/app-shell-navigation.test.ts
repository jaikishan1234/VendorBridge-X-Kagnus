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
    expect(navigationItemsForRole("VENDOR")).not.toContain("Vendors");
  });

  it("keeps procurement quotation navigation on the comparison landing page", () => {
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Quotations");
    expect(navigationHref("Quotations", "PROCUREMENT_OFFICER")).toBe("/quotations");
    expect(navigationLabel("Quotations", "PROCUREMENT_OFFICER")).toBe("Quotations");
  });

  it("connects Activity for authenticated roles and Reports for Procurement Officers", () => {
    expect(navigationHref("Activity", "VENDOR")).toBe("/activity");
    expect(navigationHref("Activity", "MANAGER")).toBe("/activity");
    expect(navigationHref("Reports", "PROCUREMENT_OFFICER")).toBe("/reports");
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Reports");
    expect(navigationItemsForRole("VENDOR")).not.toContain("Reports");
    expect(navigationItemsForRole("MANAGER")).not.toContain("Reports");
  });

  it("exposes Purchase Orders only to procurement officers and vendors", () => {
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Purchase Orders");
    expect(navigationHref("Purchase Orders", "PROCUREMENT_OFFICER")).toBe("/purchase-orders");
    expect(navigationItemsForRole("VENDOR")).toContain("Purchase Orders");
    expect(navigationHref("Purchase Orders", "VENDOR")).toBe("/purchase-orders");
  });

  it("exposes Invoices only to procurement officers and vendors", () => {
    expect(navigationItemsForRole("PROCUREMENT_OFFICER")).toContain("Invoices");
    expect(navigationHref("Invoices", "PROCUREMENT_OFFICER")).toBe("/invoices");
    expect(navigationItemsForRole("VENDOR")).toContain("Invoices");
    expect(navigationHref("Invoices", "VENDOR")).toBe("/invoices");
    expect(navigationItemsForRole("MANAGER")).not.toContain("Invoices");
    expect(navigationItemsForRole("ADMIN")).not.toContain("Invoices");
  });

  it("does not expose the quotations navigation to unsupported roles", () => {
    expect(navigationItemsForRole("MANAGER")).not.toContain("Quotations");
    expect(navigationItemsForRole("MANAGER")).not.toContain("Purchase Orders");
    expect(navigationItemsForRole("ADMIN")).not.toContain("Purchase Orders");
    expect(navigationHref("Approvals", "MANAGER")).toBe("/approvals");
    expect(navigationItemsForRole("MANAGER")).toEqual(["Dashboard", "Approvals", "Activity"]);
    expect(navigationItemsForRole("ADMIN")).toEqual(["Dashboard"]);
    expect(navigationHref("Reports", "VENDOR")).toBe("/dashboard");
  });
});
