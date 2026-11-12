import { NextResponse } from "next/server";
import { z } from "zod";
import { getActivityViewer, markNotificationRead } from "@/lib/activity";

type RouteContext = { params: Promise<{ notificationId: string }> };

export async function PATCH(_request: Request, { params }: RouteContext) {
  const viewer = await getActivityViewer();
  if (viewer.kind === "unauthenticated") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (viewer.kind === "forbidden") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const { notificationId } = await params;
  if (!z.string().uuid().safeParse(notificationId).success) {
    return NextResponse.json({ message: "Notification not found." }, { status: 404 });
  }

  try {
    const notification = await markNotificationRead(notificationId, viewer);
    if (!notification) {
      return NextResponse.json({ message: "Notification not found." }, { status: 404 });
    }
    return NextResponse.json({ notification });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return NextResponse.json(
      { message: "Unable to update notification." },
      { status: 500 },
    );
  }
}
