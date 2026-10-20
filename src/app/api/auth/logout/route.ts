import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { hashSessionToken } from "@/lib/session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("session")?.value;

    if (sessionToken) {
      const tokenHash = hashSessionToken(sessionToken);

      await db
        .delete(sessions)
        .where(eq(sessions.tokenHash, tokenHash));
    }

    const response = NextResponse.json({
      message: "Logout successful",
    });

    response.cookies.set("session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });

    return response;
  } catch (error) {
    console.error("Logout error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}