import { NextResponse } from "next/server";
import { getActivityViewer, getUnreadNotificationCount } from "@/lib/activity";

export async function GET() {
  const viewer = await getActivityViewer();
  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    return NextResponse.json({ unreadCount: await getUnreadNotificationCount(viewer) });
  } catch (error) {
    console.error("Get unread notification count error:", error);
    return NextResponse.json(
      { message: "Unable to load notification count." },
      { status: 500 },
    );
  }
}
