
import { NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { z } from "zod";

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

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

    const result = resetPasswordSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: "A valid token and password of at least 8 characters are required" },
        { status: 400 },
      );
    }

    const tokenHash = hashPasswordResetToken(result.data.token);
    const passwordHash = await hashPassword(result.data.password);

    const response = await db.transaction(async (tx) => {
      const [resetToken] = await tx
        .delete(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });

      if (!resetToken) {
        return false;
      }

      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, resetToken.userId));

      // Revoke all existing sessions after a password reset.
      await tx
        .delete(sessions)
        .where(eq(sessions.userId, resetToken.userId));

      return true;
    });

    if (!response) {
      return NextResponse.json(
        { message: "Invalid or expired reset token" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      message: "Password reset successful. Please log in again.",
    });
  } catch (error) {
    console.error("Reset-password error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
