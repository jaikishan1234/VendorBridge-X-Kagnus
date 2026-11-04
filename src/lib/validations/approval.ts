import { z } from "zod";

export const approvalDecisionSchema = z
  .object({
    action: z.enum(["APPROVE", "REJECT"]),
    remarks: z.string().trim().min(1, "Decision remarks are required.").max(2_000),
  })
  .strict();

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
