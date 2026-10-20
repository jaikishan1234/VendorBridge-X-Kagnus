
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/authorization";

export async function GET() {
  try {
    const result = await requireRole(["ADMIN"]);

    if (!result.authorized) {
      return NextResponse.json(
        {
          message:
            result.status === 401
              ? "Unauthorized"
              : "Forbidden",
        },
        { status: result.status },
      );
    }

    return NextResponse.json({
      message: "Admin access granted",
      user: result.user,
    });
  } catch (error) {
    console.error("Admin test error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
