import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/authorization";

const rolePromotionSchema = z
  .object({
    role: z.enum(["PROCUREMENT_OFFICER", "MANAGER"]),
  })
  .strict();

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const authorization = await requireRole(["ADMIN"]);

    if (!authorization.authorized) {
      return NextResponse.json(
        { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: authorization.status },
      );
    }

    const { userId } = await params;
    if (!z.string().uuid().safeParse(userId).success) {
      return NextResponse.json({ message: "User not found." }, { status: 404 });
    }

    if (authorization.user.id === userId) {
      return NextResponse.json(
        { message: "You cannot change your own role." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid JSON request body" },
        { status: 400 },
      );
    }

    const result = rolePromotionSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { message: "Only promotion to PROCUREMENT_OFFICER or MANAGER is supported." },
        { status: 400 },
      );
    }

    const [user] = await db
      .update(users)
      .set({ role: result.data.role, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      });

    if (!user) {
      return NextResponse.json({ message: "User not found." }, { status: 404 });
    }

    return NextResponse.json({
      message: `User promoted to ${user.role === "MANAGER" ? "manager" : "procurement officer"}.`,
      user,
    });
  } catch (error) {
    console.error("Procurement officer promotion error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
