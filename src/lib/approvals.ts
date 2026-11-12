import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  approvalHistory,
  approvalRequests,
  activityEvents,
  quotationLineItems,
  quotations,
  rfqLineItems,
  rfqs,
  users,
  vendors,
} from "@/db/schema";
import {
  createActivityNotifications,
  getUserIdsForRole,
  getVendorMemberUserIds,
} from "@/lib/notifications";
import { calculateComparableTotal } from "@/lib/quotation-comparison";
import type { ApprovalDecisionInput } from "@/lib/validations/approval";

export class ApprovalNotFoundError extends Error {}
export class QuotationNotFoundError extends Error {}
export class QuotationNotSubmittedError extends Error {}
export class ApprovalAlreadyExistsError extends Error {}
export class ActiveRfqApprovalError extends Error {}
export class InvalidApprovalTransitionError extends Error {}

export async function createApprovalRequest(
  rfqId: string,
  quotationId: string,
  selectedByUserId: string,
) {
  return db.transaction(async (tx) => {
    // Serialise selections for the RFQ. The partial unique index in the
    // migration is the database backstop if writes bypass this service.
    const [rfq] = await tx
      .select({ id: rfqs.id })
      .from(rfqs)
      .where(eq(rfqs.id, rfqId))
      .for("update")
      .limit(1);

    if (!rfq) throw new QuotationNotFoundError();

    const [quotation] = await tx
      .select({
        id: quotations.id,
        rfqId: quotations.rfqId,
        vendorId: quotations.vendorId,
        status: quotations.status,
      })
      .from(quotations)
      .where(and(eq(quotations.id, quotationId), eq(quotations.rfqId, rfqId)))
      .for("update")
      .limit(1);

    if (!quotation) throw new QuotationNotFoundError();
    if (quotation.status !== "SUBMITTED") throw new QuotationNotSubmittedError();

    const [existingForQuotation] = await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(eq(approvalRequests.quotationId, quotation.id))
      .limit(1);
    if (existingForQuotation) throw new ApprovalAlreadyExistsError();

    const [activeRfqApproval] = await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.rfqId, rfqId),
          inArray(approvalRequests.status, ["PENDING", "APPROVED"]),
        ),
      )
      .limit(1);
    if (activeRfqApproval) throw new ActiveRfqApprovalError();

    const selectedAt = new Date();
    const [approval] = await tx
      .insert(approvalRequests)
      .values({
        quotationId: quotation.id,
        rfqId: quotation.rfqId,
        vendorId: quotation.vendorId,
        selectedByUserId,
        selectedAt,
      })
      .returning({
        id: approvalRequests.id,
        status: approvalRequests.status,
        selectedAt: approvalRequests.selectedAt,
      });

    await tx.insert(approvalHistory).values({
      approvalRequestId: approval.id,
      actorUserId: selectedByUserId,
      action: "SUBMITTED",
      occurredAt: selectedAt,
    });

    const activityEventId = randomUUID();
    await tx.insert(activityEvents).values({
      id: activityEventId,
      eventType: "APPROVAL_REQUESTED",
      actorUserId: selectedByUserId,
      isSystemGenerated: false,
      affectedEntityType: "APPROVAL_REQUEST",
      affectedEntityId: approval.id,
      rfqId: quotation.rfqId,
      quotationId: quotation.id,
      approvalRequestId: approval.id,
      vendorId: quotation.vendorId,
      metadata: {},
      occurredAt: selectedAt,
    });
    await createActivityNotifications(tx, {
      activityEventId,
      recipientUserIds: await getUserIdsForRole(tx, "MANAGER"),
    });

    return approval;
  });
}

export async function decideApproval(
  approvalId: string,
  managerUserId: string,
  input: ApprovalDecisionInput,
) {
  return db.transaction(async (tx) => {
    const [approval] = await tx
      .select({
        id: approvalRequests.id,
        status: approvalRequests.status,
        quotationId: approvalRequests.quotationId,
        rfqId: approvalRequests.rfqId,
        vendorId: approvalRequests.vendorId,
        selectedByUserId: approvalRequests.selectedByUserId,
      })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, approvalId))
      .for("update")
      .limit(1);

    if (!approval) throw new ApprovalNotFoundError();
    if (approval.status !== "PENDING") throw new InvalidApprovalTransitionError();

    const decidedAt = new Date();
    const status = input.action === "APPROVE" ? "APPROVED" : "REJECTED";
    const [decided] = await tx
      .update(approvalRequests)
      .set({
        status,
        decidedByUserId: managerUserId,
        decidedAt,
        decisionRemarks: input.remarks,
        updatedAt: decidedAt,
      })
      .where(
        and(
          eq(approvalRequests.id, approval.id),
          eq(approvalRequests.status, "PENDING"),
        ),
      )
      .returning({ id: approvalRequests.id, status: approvalRequests.status });

    if (!decided) throw new InvalidApprovalTransitionError();

    await tx.insert(approvalHistory).values({
      approvalRequestId: approval.id,
      actorUserId: managerUserId,
      action: status,
      remarks: input.remarks,
      occurredAt: decidedAt,
    });

    const activityEventId = randomUUID();
    await tx.insert(activityEvents).values({
      id: activityEventId,
      eventType: status === "APPROVED" ? "APPROVAL_APPROVED" : "APPROVAL_REJECTED",
      actorUserId: managerUserId,
      isSystemGenerated: false,
      affectedEntityType: "APPROVAL_REQUEST",
      affectedEntityId: approval.id,
      rfqId: approval.rfqId,
      quotationId: approval.quotationId,
      approvalRequestId: approval.id,
      vendorId: approval.vendorId,
      metadata: {},
      occurredAt: decidedAt,
    });
    await createActivityNotifications(tx, {
      activityEventId,
      recipientUserIds: [
        approval.selectedByUserId,
        ...(await getVendorMemberUserIds(tx, approval.vendorId)),
      ],
    });

    return decided;
  });
}

export async function getPendingApprovals() {
  const selectedBy = alias(users, "approval_selected_by_user");
  const rows = await db
    .select({
      id: approvalRequests.id,
      status: approvalRequests.status,
      selectedAt: approvalRequests.selectedAt,
      quotationId: quotations.id,
      rfqId: rfqs.id,
      rfqNumber: rfqs.rfqNumber,
      rfqTitle: rfqs.title,
      currency: rfqs.currency,
      vendorName: vendors.vendorName,
      selectedByUsername: selectedBy.username,
    })
    .from(approvalRequests)
    .innerJoin(quotations, eq(approvalRequests.quotationId, quotations.id))
    .innerJoin(rfqs, eq(approvalRequests.rfqId, rfqs.id))
    .innerJoin(vendors, eq(approvalRequests.vendorId, vendors.id))
    .innerJoin(selectedBy, eq(approvalRequests.selectedByUserId, selectedBy.id))
    .where(eq(approvalRequests.status, "PENDING"))
    .orderBy(asc(approvalRequests.selectedAt));

  if (rows.length === 0) return [];

  const quotationIds = rows.map((row) => row.quotationId);
  const quotationRows = await db
    .select({
      quotationId: quotationLineItems.quotationId,
      quantity: rfqLineItems.quantity,
      unitPrice: quotationLineItems.unitPrice,
    })
    .from(quotationLineItems)
    .innerJoin(rfqLineItems, eq(quotationLineItems.rfqLineItemId, rfqLineItems.id))
    .where(inArray(quotationLineItems.quotationId, quotationIds));

  const lineItemsByQuotation = new Map<string, typeof quotationRows>();
  quotationRows.forEach((lineItem) => {
    const values = lineItemsByQuotation.get(lineItem.quotationId) ?? [];
    values.push(lineItem);
    lineItemsByQuotation.set(lineItem.quotationId, values);
  });

  return rows.map((row) => ({
    ...row,
    total: calculateComparableTotal(lineItemsByQuotation.get(row.quotationId) ?? []).total,
  }));
}

export async function getApprovalDetail(approvalId: string) {
  const selectedBy = alias(users, "approval_selected_by_user");
  const decidedBy = alias(users, "approval_decided_by_user");
  const [approval] = await db
    .select({
      id: approvalRequests.id,
      status: approvalRequests.status,
      selectedAt: approvalRequests.selectedAt,
      decidedAt: approvalRequests.decidedAt,
      decisionRemarks: approvalRequests.decisionRemarks,
      quotationId: quotations.id,
      rfqId: rfqs.id,
      rfqNumber: rfqs.rfqNumber,
      rfqTitle: rfqs.title,
      currency: rfqs.currency,
      vendorName: vendors.vendorName,
      vendorEmail: vendors.email,
      deliveryTimeline: quotations.deliveryTimeline,
      notes: quotations.notes,
      selectedByUsername: selectedBy.username,
      decidedByUsername: decidedBy.username,
    })
    .from(approvalRequests)
    .innerJoin(quotations, eq(approvalRequests.quotationId, quotations.id))
    .innerJoin(rfqs, eq(approvalRequests.rfqId, rfqs.id))
    .innerJoin(vendors, eq(approvalRequests.vendorId, vendors.id))
    .innerJoin(selectedBy, eq(approvalRequests.selectedByUserId, selectedBy.id))
    .leftJoin(decidedBy, eq(approvalRequests.decidedByUserId, decidedBy.id))
    .where(eq(approvalRequests.id, approvalId))
    .limit(1);

  if (!approval) return null;

  const lineItems = await db
    .select({
      id: rfqLineItems.id,
      lineNumber: rfqLineItems.lineNumber,
      description: rfqLineItems.description,
      quantity: rfqLineItems.quantity,
      unit: rfqLineItems.unit,
      unitPrice: quotationLineItems.unitPrice,
    })
    .from(quotationLineItems)
    .innerJoin(rfqLineItems, eq(quotationLineItems.rfqLineItemId, rfqLineItems.id))
    .where(eq(quotationLineItems.quotationId, approval.quotationId))
    .orderBy(asc(rfqLineItems.lineNumber));

  const historyActor = alias(users, "approval_history_actor");
  const history = await db
    .select({
      id: approvalHistory.id,
      action: approvalHistory.action,
      remarks: approvalHistory.remarks,
      occurredAt: approvalHistory.occurredAt,
      actorUsername: historyActor.username,
    })
    .from(approvalHistory)
    .innerJoin(historyActor, eq(approvalHistory.actorUserId, historyActor.id))
    .where(eq(approvalHistory.approvalRequestId, approval.id))
    .orderBy(asc(approvalHistory.occurredAt), asc(approvalHistory.id));

  return {
    ...approval,
    lineItems,
    total: calculateComparableTotal(lineItems).total,
    history,
  };
}

export async function getApprovalHistory(approvalId: string) {
  const historyActor = alias(users, "approval_history_actor");
  return db
    .select({
      id: approvalHistory.id,
      action: approvalHistory.action,
      remarks: approvalHistory.remarks,
      occurredAt: approvalHistory.occurredAt,
      actorUsername: historyActor.username,
    })
    .from(approvalHistory)
    .innerJoin(historyActor, eq(approvalHistory.actorUserId, historyActor.id))
    .where(eq(approvalHistory.approvalRequestId, approvalId))
    .orderBy(desc(approvalHistory.occurredAt), desc(approvalHistory.id));
}
