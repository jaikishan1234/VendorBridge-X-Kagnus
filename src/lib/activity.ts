import { and, count, desc, eq, exists, inArray, isNull, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  activityEvents,
  invoices,
  notifications,
  purchaseOrders,
  rfqVendorAssignments,
  rfqs,
  users,
  vendorUserMemberships,
  vendors,
} from "@/db/schema";
import { activityDescription } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/auth";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type ActivityViewer =
  | { kind: "procurement"; user: CurrentUser }
  | { kind: "manager"; user: CurrentUser }
  | { kind: "vendor"; user: CurrentUser; vendorId: string }
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; user: CurrentUser };

export async function getActivityViewer(): Promise<ActivityViewer> {
  const user = await getCurrentUser();
  if (!user) return { kind: "unauthenticated" };
  if (user.role === "PROCUREMENT_OFFICER") return { kind: "procurement", user };
  if (user.role === "MANAGER") return { kind: "manager", user };
  if (user.role !== "VENDOR") return { kind: "forbidden", user };

  const [membership] = await db
    .select({ vendorId: vendorUserMemberships.vendorId })
    .from(vendorUserMemberships)
    .where(eq(vendorUserMemberships.userId, user.id))
    .limit(1);
  if (!membership) return { kind: "forbidden", user };
  return { kind: "vendor", user, vendorId: membership.vendorId };
}

function activityVisibilityWhere(viewer: Exclude<ActivityViewer, { kind: "unauthenticated" | "forbidden" }>): SQL | undefined {
  if (viewer.kind === "procurement") return undefined;
  if (viewer.kind === "manager") {
    return inArray(activityEvents.eventType, [
      "APPROVAL_REQUESTED",
      "APPROVAL_APPROVED",
      "APPROVAL_REJECTED",
    ]);
  }

  return or(
    eq(activityEvents.vendorId, viewer.vendorId),
    and(
      eq(activityEvents.eventType, "RFQ_PUBLISHED"),
      exists(
        db
          .select({ id: rfqVendorAssignments.id })
          .from(rfqVendorAssignments)
          .where(
            and(
              eq(rfqVendorAssignments.rfqId, activityEvents.rfqId),
              eq(rfqVendorAssignments.vendorId, viewer.vendorId),
            ),
          ),
      ),
    ),
  );
}

const activityActor = alias(users, "activity_actor");

function activitySelection() {
  return {
    id: activityEvents.id,
    eventType: activityEvents.eventType,
    occurredAt: activityEvents.occurredAt,
    actorUsername: activityActor.username,
    rfqNumber: rfqs.rfqNumber,
    rfqTitle: rfqs.title,
    quotationId: activityEvents.quotationId,
    approvalRequestId: activityEvents.approvalRequestId,
    vendorName: vendors.vendorName,
    purchaseOrderNumber: purchaseOrders.poNumber,
    invoiceNumber: invoices.invoiceNumber,
  };
}

type ActivityRow = {
  id: string;
  eventType: string;
  occurredAt: Date;
  actorUsername: string | null;
  rfqNumber: string | null;
  rfqTitle: string | null;
  quotationId: string | null;
  approvalRequestId: string | null;
  vendorName: string | null;
  purchaseOrderNumber: string | null;
  invoiceNumber: string | null;
};

function decorateActivity<T extends ActivityRow>(event: T) {
  return {
    ...event,
    description: activityDescription(event.eventType, event),
  };
}

function activityQuery(viewer: Exclude<ActivityViewer, { kind: "unauthenticated" | "forbidden" }>) {
  const query = db
    .select(activitySelection())
    .from(activityEvents)
    .leftJoin(activityActor, eq(activityEvents.actorUserId, activityActor.id))
    .leftJoin(rfqs, eq(activityEvents.rfqId, rfqs.id))
    .leftJoin(vendors, eq(activityEvents.vendorId, vendors.id))
    .leftJoin(purchaseOrders, eq(activityEvents.purchaseOrderId, purchaseOrders.id))
    .leftJoin(invoices, eq(activityEvents.invoiceId, invoices.id));
  const visibility = activityVisibilityWhere(viewer);
  return visibility ? query.where(visibility) : query;
}

export async function getActivityTimeline(
  viewer: Exclude<ActivityViewer, { kind: "unauthenticated" | "forbidden" }>,
) {
  const rows = await activityQuery(viewer).orderBy(
    desc(activityEvents.occurredAt),
    desc(activityEvents.id),
  );
  return rows.map(decorateActivity);
}

export async function getNotifications(
  viewer: Exclude<ActivityViewer, { kind: "unauthenticated" | "forbidden" }>,
) {
  const visibility = activityVisibilityWhere(viewer);
  const conditions = [eq(notifications.recipientUserId, viewer.user.id)];
  if (visibility) conditions.push(visibility);

  const rows = await db
    .select({
      notificationId: notifications.id,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      ...activitySelection(),
    })
    .from(notifications)
    .innerJoin(activityEvents, eq(notifications.activityEventId, activityEvents.id))
    .leftJoin(activityActor, eq(activityEvents.actorUserId, activityActor.id))
    .leftJoin(rfqs, eq(activityEvents.rfqId, rfqs.id))
    .leftJoin(vendors, eq(activityEvents.vendorId, vendors.id))
    .leftJoin(purchaseOrders, eq(activityEvents.purchaseOrderId, purchaseOrders.id))
    .leftJoin(invoices, eq(activityEvents.invoiceId, invoices.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id));

  return rows.map((row) => ({
    ...decorateActivity(row),
    id: row.notificationId,
    activityEventId: row.id,
    isRead: row.readAt !== null,
  }));
}

export async function getUnreadNotificationCount(
  viewer: Exclude<ActivityViewer, { kind: "unauthenticated" | "forbidden" }>,
) {
  const visibility = activityVisibilityWhere(viewer);
  const conditions = [
    eq(notifications.recipientUserId, viewer.user.id),
    isNull(notifications.readAt),
  ];
  if (visibility) conditions.push(visibility);

  const [result] = await db
    .select({ value: count() })
    .from(notifications)
    .innerJoin(activityEvents, eq(notifications.activityEventId, activityEvents.id))
    .where(and(...conditions));
  return result?.value ?? 0;
}

export async function markNotificationRead(
  notificationId: string,
  viewer: Exclude<ActivityViewer, { kind: "unauthenticated" | "forbidden" }>,
) {
  const visibility = activityVisibilityWhere(viewer);
  const conditions = [
    eq(notifications.id, notificationId),
    eq(notifications.recipientUserId, viewer.user.id),
  ];
  if (visibility) conditions.push(visibility);

  const [notification] = await db
    .select({ id: notifications.id, readAt: notifications.readAt })
    .from(notifications)
    .innerJoin(activityEvents, eq(notifications.activityEventId, activityEvents.id))
    .where(and(...conditions))
    .limit(1);
  if (!notification) return null;
  if (notification.readAt) return notification;

  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notification.id),
        eq(notifications.recipientUserId, viewer.user.id),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id, readAt: notifications.readAt });
  return updated ?? notification;
}
