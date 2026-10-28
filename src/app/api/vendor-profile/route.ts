import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { vendorUserMemberships, vendors } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createVendorSchema } from "@/lib/validations/vendor";

class ExistingVendorMembershipError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "VENDOR") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
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

    const result = createVendorSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        {
          message: "Review your vendor profile details and try again.",
          fieldErrors: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const vendor = await db.transaction(async (tx) => {
      const [existingMembership] = await tx
        .select({ id: vendorUserMemberships.id })
        .from(vendorUserMemberships)
        .where(eq(vendorUserMemberships.userId, user.id))
        .limit(1);

      if (existingMembership) {
        throw new ExistingVendorMembershipError();
      }

      const [createdVendor] = await tx
        .insert(vendors)
        .values({
          vendorName: result.data.vendorName,
          category: result.data.category,
          gstNumber: result.data.gstNumber || null,
          contactName: result.data.contactName,
          email: result.data.email,
          phoneNumber: result.data.phoneNumber,
          status: "PENDING",
        })
        .returning({ id: vendors.id });

      await tx.insert(vendorUserMemberships).values({
        vendorId: createdVendor.id,
        userId: user.id,
      });

      return createdVendor;
    });

    return NextResponse.json(
      {
        message: "Vendor profile created. It is pending review.",
        vendor,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ExistingVendorMembershipError || isUniqueViolation(error)) {
      return NextResponse.json(
        { message: "You already have a vendor profile or an identifier is already in use." },
        { status: 409 },
      );
    }

    console.error("Create vendor self-profile error:", error);
    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
