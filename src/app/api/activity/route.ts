import { NextResponse } from "next/server";
import { getActivityTimeline, getActivityViewer } from "@/lib/activity";

export async function GET() {
  const viewer = await getActivityViewer();
  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json({ activities: await getActivityTimeline(viewer) });
  } catch (error) {
    console.error("Get activity timeline error:", error);
    return NextResponse.json(
      { message: "Unable to load activity." },
      { status: 500 },
    );
  }
}
