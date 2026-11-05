import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PurchaseOrderDetailPanel } from "@/components/purchase-orders/purchase-order-detail-panel";
import { PurchaseOrdersPanel } from "@/components/purchase-orders/purchase-orders-panel";

describe("Purchase Order client panels", () => {
  it("labels the collection for a procurement officer while data is loading", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseOrdersPanel, { isProcurement: true }));

    expect(markup).toContain("Purchase Orders");
    expect(markup).toContain("Loading purchase orders");
  });

  it("labels the collection for a vendor without a generation workflow", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseOrdersPanel, { isProcurement: false }));

    expect(markup).toContain("My Purchase Orders");
    expect(markup).toContain("Loading purchase orders");
  });

  it("keeps PO detail loading behind the authorized API request", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseOrderDetailPanel, { poId: "po-1" }));

    expect(markup).toContain("Loading purchase order");
  });
});
