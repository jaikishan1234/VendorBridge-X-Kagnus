import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/validations/auth";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { verifyPassword } from "@/lib/password";
import { generateSessionToken, hashSessionToken } from "@/lib/session";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: "Username/email and password are required" },
        { status: 400 },
      );
    }

    const { identifier } = result.data;

    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.username, identifier), eq(users.email, identifier)))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { message: "Invalid username/email or password" },
        { status: 401 },
      );
    }

    const isPasswordValid = await verifyPassword(
      user.passwordHash,
      result.data.password,
    );

    if (!isPasswordValid) {
      return NextResponse.json(
        { message: "Invalid username/email or password" },
        { status: 401 },
      );
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(sessions).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const response = NextResponse.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
