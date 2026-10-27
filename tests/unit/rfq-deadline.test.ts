import { describe, expect, it } from "vitest";
import { deadlineFromApiValue, deadlineToApiValue } from "@/lib/rfq-deadline";
import { createRfqSchema } from "@/lib/validations/rfq";

const validRfq = {
  title: "Office equipment refresh",
  description: "Laptops and monitors for the support team.",
  currency: "usd",
  deadline: "2100-01-15T12:00:00.000Z",
  lineItems: [{ description: "Laptop", quantity: "10", unit: "Each" }],
  vendorIds: ["b1111111-1111-4111-8111-111111111111"],
};

describe("RFQ deadline values", () => {
  it("serializes a selected local date and time as the timezone-bearing API value", () => {
    const selectedDeadline = new Date(2030, 0, 15, 13, 45);

    expect(deadlineToApiValue(selectedDeadline)).toBe(selectedDeadline.toISOString());
  });

  it("parses a valid API deadline and ignores an invalid or empty picker value", () => {
    expect(deadlineFromApiValue("2030-01-15T13:45:00.000Z")?.toISOString()).toBe(
      "2030-01-15T13:45:00.000Z",
    );
    expect(deadlineFromApiValue("")).toBeNull();
    expect(deadlineFromApiValue("not-a-date")).toBeNull();
  });

  it("reports missing, invalid, and past deadlines before submission", () => {
    expect(createRfqSchema.safeParse({ ...validRfq, deadline: "" }).error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "Quotation deadline is required." }),
      ]),
    );
    expect(
      createRfqSchema.safeParse({ ...validRfq, deadline: "2030-01-15 13:45" }).error?.issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "Select a valid date and time." }),
      ]),
    );
    expect(
      createRfqSchema.safeParse({ ...validRfq, deadline: "2000-01-15T13:45:00.000Z" }).error
        ?.issues,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: "Deadline must be in the future." }),
      ]),
    );
  });
});
