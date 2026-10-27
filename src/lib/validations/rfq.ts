import { z } from "zod";

const quantityPattern = /^\d{1,11}(?:\.\d{1,3})?$/;

export const rfqLineItemSchema = z.object({
  description: z.string().trim().min(1, "Line-item description is required.").max(1000),
  quantity: z
    .string()
    .trim()
    .regex(quantityPattern, "Enter a quantity with up to 3 decimal places.")
    .refine((value) => Number(value) > 0, "Quantity must be greater than zero."),
  unit: z.string().trim().min(1, "Unit is required.").max(100),
});

export const createRfqSchema = z
  .object({
    title: z.string().trim().min(1, "RFQ title is required.").max(200),
    description: z
      .string()
      .trim()
      .min(1, "Product or service details are required.")
      .max(5000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code.")
      .transform((value) => value.toUpperCase()),
    deadline: z
      .string()
      .min(1, "Quotation deadline is required.")
      .datetime({ offset: true, message: "Select a valid date and time." })
      .transform((value) => new Date(value))
      .refine((value) => value.getTime() > Date.now(), "Deadline must be in the future."),
    lineItems: z.array(rfqLineItemSchema).min(1, "Add at least one line item.").max(100),
    vendorIds: z
      .array(z.string().uuid("Select registered vendors."))
      .min(1, "Select at least one vendor.")
      .max(500),
  })
  .superRefine((data, context) => {
    if (new Set(data.vendorIds).size !== data.vendorIds.length) {
      context.addIssue({
        code: "custom",
        message: "Each vendor can be selected only once.",
        path: ["vendorIds"],
      });
    }
  });

export type CreateRfqInput = z.input<typeof createRfqSchema>;
export type CreateRfqValues = z.output<typeof createRfqSchema>;
