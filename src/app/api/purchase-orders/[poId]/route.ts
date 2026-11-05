import { NextResponse } from "next/server";
import { z } from "zod";
import { getPurchaseOrder } from "@/lib/purchase-orders";
import { getRfqViewer } from "@/lib/rfq-access";

type RouteContext = { params: Promise<{ poId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const viewer = await getRfqViewer();

  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  if (viewer.kind === "unlinked-vendor") {
    return NextResponse.json({ message: "Purchase order not found." }, { status: 404 });
  }

  const { poId } = await params;
  if (!z.string().uuid().safeParse(poId).success) {
    return NextResponse.json({ message: "Purchase order not found." }, { status: 404 });
  }

  try {
    const purchaseOrder = await getPurchaseOrder(
      poId,
      viewer.kind === "vendor" ? viewer.vendorId : undefined,
    );
    if (!purchaseOrder) {
      return NextResponse.json({ message: "Purchase order not found." }, { status: 404 });
    }

    return NextResponse.json({ purchaseOrder });
  } catch (error) {
    console.error("Get purchase order error:", error);
    return NextResponse.json(
      { message: "Unable to load purchase order." },
      { status: 500 },
    );
  }
}
