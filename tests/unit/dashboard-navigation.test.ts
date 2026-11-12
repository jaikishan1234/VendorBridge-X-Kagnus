import { describe, expect, it } from "vitest";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

function hrefs(node: unknown): string[] {
  if (!node || typeof node !== "object") return [];
  const element = node as { props?: { href?: string; children?: unknown } };
  const ownHref = typeof element.props?.href === "string" ? [element.props.href] : [];
  const children = Array.isArray(element.props?.children)
    ? element.props?.children
    : [element.props?.children];
  return [...ownHref, ...children.flatMap(hrefs)];
}

describe("dashboard action navigation", () => {
  it("links procurement actions to real RFQ, vendor, and invoice destinations", () => {
    const links = hrefs(DashboardShell({
      user: { username: "procurement", email: "procurement@example.com", role: "PROCUREMENT_OFFICER" },
    }));

    expect(links).toEqual(expect.arrayContaining(["/rfqs/new", "/vendors/new", "/invoices"]));
    expect(links).not.toContain("/dashboard?comingSoon=RFQs");
    expect(links).not.toContain("/dashboard?comingSoon=Invoices");
  });

  it("does not expose procurement-only dashboard actions to vendors or managers", () => {
    const vendorLinks = hrefs(DashboardShell({
      user: { username: "vendor", email: "vendor@example.com", role: "VENDOR" },
    }));
    const managerLinks = hrefs(DashboardShell({
      user: { username: "manager", email: "manager@example.com", role: "MANAGER" },
    }));

    expect(vendorLinks).toContain("/invoices");
    expect(vendorLinks).not.toEqual(expect.arrayContaining(["/rfqs/new", "/vendors/new"]));
    expect(managerLinks).not.toEqual(expect.arrayContaining(["/rfqs/new", "/vendors/new", "/invoices"]));
  });
});
