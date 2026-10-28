import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { rfqLineItems, rfqVendorAssignments, rfqs, vendors } from "@/db/schema";
import { requireRole } from "@/lib/authorization";
import { createRfqSchema, type CreateRfqValues } from "@/lib/validations/rfq";

const maximumRfqNumberAttempts = 3;

class UnknownVendorSelectionError extends Error {}

function generateRfqNumber(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

  return `RFQ-${date}-${suffix}`;
}

function isRfqNumberConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "rfqs_rfq_number_unique"
  );
}

async function createRfq(
  input: CreateRfqValues,
  createdByUserId: string,
) {
  for (let attempt = 0; attempt < maximumRfqNumberAttempts; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        const selectedVendors = await tx
          .select({ id: vendors.id })
          .from(vendors)
          .where(inArray(vendors.id, input.vendorIds));

        if (selectedVendors.length !== input.vendorIds.length) {
          throw new UnknownVendorSelectionError();
        }

        const [rfq] = await tx
          .insert(rfqs)
          .values({
            rfqNumber: generateRfqNumber(),
            title: input.title,
            category: input.category,
            description: input.description || null,
            currency: input.currency,
            deadline: input.deadline,
            createdByUserId,
          })
          .returning({ id: rfqs.id, rfqNumber: rfqs.rfqNumber });

        await tx.insert(rfqLineItems).values(
          input.lineItems.map((lineItem, index) => ({
            rfqId: rfq.id,
            lineNumber: index + 1,
            description: lineItem.description,
            quantity: lineItem.quantity,
            unit: lineItem.unit,
          })),
        );

        await tx.insert(rfqVendorAssignments).values(
          input.vendorIds.map((vendorId) => ({
            rfqId: rfq.id,
            vendorId,
          })),
        );

        return rfq;
      });
    } catch (error) {
      if (error instanceof UnknownVendorSelectionError) {
        throw error;
      }

      if (isRfqNumberConflict(error) && attempt < maximumRfqNumberAttempts - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Unable to generate a unique RFQ number.");
}

export async function POST(request: Request) {
  try {
    const authorization = await requireRole(["PROCUREMENT_OFFICER"]);

    if (!authorization.authorized) {
      return NextResponse.json(
        { message: authorization.status === 401 ? "Unauthorized" : "Forbidden" },
        { status: authorization.status },
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

    const result = createRfqSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          message: "Review the RFQ details and try again.",
          fieldErrors: result.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const rfq = await createRfq(result.data, authorization.user.id);

    return NextResponse.json(
      { message: "RFQ created successfully", rfq },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnknownVendorSelectionError) {
      return NextResponse.json(
        { message: "One or more selected vendors no longer exist." },
        { status: 400 },
      );
    }

    console.error("Create RFQ error:", error);

    return NextResponse.json(
      { message: "An unexpected error occurred" },
      { status: 500 },
    );
  }
}
