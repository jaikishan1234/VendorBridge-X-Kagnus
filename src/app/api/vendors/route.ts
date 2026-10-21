import { NextResponse } from "next/server";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { createVendorSchema } from "@/lib/validations/vendor";

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

    const body: unknown = await request.json();
    const result = createVendorSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          message: "Review the vendor details and try again.",
          fieldErrors: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const [vendor] = await db
      .insert(vendors)
      .values({
        vendorName: result.data.vendorName,
        category: result.data.category,
        gstNumber: result.data.gstNumber || null,
        contactName: result.data.contactName,
        email: result.data.email,
        phoneNumber: result.data.phoneNumber,
      })
      .returning({ id: vendors.id });

    return NextResponse.json(
      { message: "Vendor added successfully", vendor },
      { status: 201 },
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { message: "A vendor with this GST number already exists." },
        { status: 409 },
      );
    }

    console.error("Create vendor error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
