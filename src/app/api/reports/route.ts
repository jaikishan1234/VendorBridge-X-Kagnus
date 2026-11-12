import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";
import { getReportData } from "@/lib/reports";

export async function GET() {
  const authorization = await requireRole(["PROCUREMENT_OFFICER"]);
  if (!authorization.authorized) {
    return NextResponse.json(
      { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
      { status: authorization.status },
    );
  }

  try {
    return NextResponse.json({ report: await getReportData() });
  } catch (error) {
    console.error("Get reports error:", error);
    return NextResponse.json({ message: "Unable to load reports." }, { status: 500 });
  }
}
