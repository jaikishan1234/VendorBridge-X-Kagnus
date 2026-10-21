import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "@/lib/password-reset";
import { forgotPasswordSchema } from "@/lib/validations/auth";

export async function POST(request: Request) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const result = forgotPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: "A valid email is required" },
        { status: 400 },
      );
    }

    const email = result.data.email.toLowerCase();

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let resetToken: string | undefined;

    if (user) {
      const token = generatePasswordResetToken();
      resetToken = token;
      const tokenHash = hashPasswordResetToken(token);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, user.id));

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
      });

      if (process.env.NODE_ENV === "development") {
        console.info("Password reset token generated for local testing.");
      }
    }

    const responseBody: {
      message: string;
      resetToken?: string;
    } = {
      message:
        "If an account exists for that email, reset instructions will be sent.",
    };

    if (process.env.NODE_ENV === "development" && user) {
      responseBody.resetToken = resetToken;
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("Forgot-password error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
