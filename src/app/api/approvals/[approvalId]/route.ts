import { NextResponse } from "next/server";
import { z } from "zod";
import { getApprovalDetail } from "@/lib/approvals";
import { requireRole } from "@/lib/authorization";

type RouteContext = { params: Promise<{ approvalId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const authorization = await requireRole(["MANAGER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  const { approvalId } = await params;
  if (!z.string().uuid().safeParse(approvalId).success) {
    return NextResponse.json({ message: "Approval not found." }, { status: 404 });
  }

  try {
    const approval = await getApprovalDetail(approvalId);
    if (!approval) {
      return NextResponse.json({ message: "Approval not found." }, { status: 404 });
    }
    return NextResponse.json({ approval });
  } catch (error) {
    console.error("Get approval detail error:", error);
    return NextResponse.json(
      { message: "Unable to load approval." },
      { status: 500 },
    );
  }
}
