import { requireRole } from "@/lib/authorization";
import { buildPurchaseOrderCsv, getPurchaseOrderReportRows } from "@/lib/reports";

export async function GET() {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    return Response.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  try {
    const csv = buildPurchaseOrderCsv(await getPurchaseOrderReportRows());
    return new Response(csv, {
      headers: {
        "content-disposition": 'attachment; filename="vendorbridge-purchase-orders.csv"',
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Export purchase order report error:", error);
    return Response.json({ message: "Unable to export purchase orders." }, { status: 500 });
  }
}
