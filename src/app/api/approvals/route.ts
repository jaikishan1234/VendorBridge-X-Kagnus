import { NextResponse } from "next/server";
import { getPendingApprovals } from "@/lib/approvals";
import { requireRole } from "@/lib/authorization";

export async function GET() {
  const authorization = await requireRole(["MANAGER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  try {
    return NextResponse.json({ approvals: await getPendingApprovals() });
  } catch (error) {
    console.error("Get pending approvals error:", error);
    return NextResponse.json(
      { message: "Unable to load pending approvals." },
      { status: 500 },
    );
  }
}
