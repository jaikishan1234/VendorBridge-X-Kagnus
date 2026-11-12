import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/validations/auth";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

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

    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { message: "Invalid registration data" },
        { status: 400 },
      );
    }

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(
        or(
          eq(users.username, result.data.username),
          eq(users.email, result.data.email),
        ),
      )
      .limit(1);

    if (existingUser.length > 0) {
      return NextResponse.json(
        { message: "Username or email is already registered" },
        { status: 409 },
      );
    }

    const data = result.data;

    const passwordHash = await hashPassword(data.password);

    const [newUser] = await db
      .insert(users)
      .values({
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        passwordHash,
        role: "VENDOR",
        country: data.country,
        photoUrl: data.photoUrl || null,
        additionalInformation: data.additionalInformation || null,
      })
      .returning({ 
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      });

    return NextResponse.json(
      {
        message: "Registration successful",
        user: newUser,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Registration error:", error);

    return NextResponse.json(
        { message: "An unexpected error occurred" },
        { status: 500 },
    );
  }
}
