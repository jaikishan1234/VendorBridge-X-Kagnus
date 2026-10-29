import { z } from "zod";

// quotation_line_items.unit_price is numeric(14, 2). Keep the API input as a
// decimal string so that we never lose precision by passing prices through a
// JavaScript number.
const monetaryAmountPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export const quotationLineItemSchema = z.object({
  rfqLineItemId: z.string().uuid("Select a valid RFQ line item."),
  unitPrice: z
    .string()
    .trim()
    .regex(
      monetaryAmountPattern,
      "Enter a non-negative amount with up to 2 decimal places.",
    ),
}).strict();

const quotationLineItemsSchema = z
  .array(quotationLineItemSchema)
  .min(1, "Add at least one quoted line item.")
  .max(100, "An RFQ can contain at most 100 quoted line items.")
  .superRefine((lineItems, context) => {
    const seen = new Set<string>();

    lineItems.forEach((lineItem, index) => {
      if (seen.has(lineItem.rfqLineItemId)) {
        context.addIssue({
          code: "custom",
          message: "Each RFQ line item can be quoted only once.",
          path: [index, "rfqLineItemId"],
        });
      }
      seen.add(lineItem.rfqLineItemId);
    });
  });

export const quotationDraftSchema = z.object({
  lineItems: quotationLineItemsSchema,
}).strict();

// The JSON shape is intentionally identical. Submission additionally checks
// against the saved RFQ line items on the server, where ownership can be
// verified.
export const quotationSubmissionSchema = quotationDraftSchema;

export type QuotationDraftInput = z.output<typeof quotationDraftSchema>;
export type QuotationSubmissionInput = z.output<typeof quotationSubmissionSchema>;
