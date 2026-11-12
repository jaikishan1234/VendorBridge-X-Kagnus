import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  notifications,
  users,
  vendorUserMemberships,
  type UserRole,
} from "@/db/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ActivityNotificationInput = {
  activityEventId: string;
  recipientUserIds: string[];
};

export function uniqueRecipientUserIds(recipientUserIds: string[]): string[] {
  return [...new Set(recipientUserIds)];
}

/**
 * Inserts recipient-specific notifications in the same transaction as the
 * activity event. The database unique constraint remains the idempotency
 * backstop when a workflow is retried.
 */
export async function createActivityNotifications(
  tx: Transaction,
  { activityEventId, recipientUserIds }: ActivityNotificationInput,
) {
  const uniqueRecipients = uniqueRecipientUserIds(recipientUserIds);
  if (uniqueRecipients.length === 0) return;

  await tx
    .insert(notifications)
    .values(
      uniqueRecipients.map((recipientUserId) => ({
        activityEventId,
        recipientUserId,
      })),
    )
    .onConflictDoNothing();
}

export async function getUserIdsForRole(tx: Transaction, role: UserRole) {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, role));
  return rows.map((row) => row.id);
}

export async function getVendorMemberUserIds(tx: Transaction, vendorId: string) {
  const rows = await tx
    .select({ userId: vendorUserMemberships.userId })
    .from(vendorUserMemberships)
    .where(eq(vendorUserMemberships.vendorId, vendorId));
  return rows.map((row) => row.userId);
}

export async function getVendorMemberUserIdsForVendors(
  tx: Transaction,
  vendorIds: string[],
) {
  if (vendorIds.length === 0) return [];

  const rows = await tx
    .select({ userId: vendorUserMemberships.userId })
    .from(vendorUserMemberships)
    .where(inArray(vendorUserMemberships.vendorId, vendorIds));
  return rows.map((row) => row.userId);
}

export function activityDescription(eventType: string, details: {
  rfqNumber: string | null;
  quotationId: string | null;
  approvalRequestId: string | null;
  purchaseOrderNumber: string | null;
  invoiceNumber: string | null;
}) {
  const rfq = details.rfqNumber ? `RFQ ${details.rfqNumber}` : "an RFQ";
  const invoice = details.invoiceNumber
    ? `Invoice ${details.invoiceNumber}`
    : "An invoice";

  switch (eventType) {
    case "RFQ_CREATED": return `${rfq} was created.`;
    case "RFQ_PUBLISHED": return `${rfq} was published.`;
    case "QUOTATION_SUBMITTED": return `A quotation was submitted for ${rfq}.`;
    case "APPROVAL_REQUESTED": return `An approval was requested for ${rfq}.`;
    case "APPROVAL_APPROVED": return `An approval was approved for ${rfq}.`;
    case "APPROVAL_REJECTED": return `An approval was rejected for ${rfq}.`;
    case "PURCHASE_ORDER_GENERATED": return details.purchaseOrderNumber
      ? `Purchase order ${details.purchaseOrderNumber} was generated.`
      : "A purchase order was generated.";
    case "INVOICE_GENERATED": return `${invoice} was generated.`;
    case "INVOICE_EMAIL_SENT": return `${invoice} was submitted to SMTP.`;
    case "INVOICE_EMAIL_FAILED": return `${invoice} email could not be sent.`;
    default: return "A procurement activity was recorded.";
  }
}
