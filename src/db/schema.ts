import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", [
  "PROCUREMENT_OFFICER",
  "VENDOR",
  "MANAGER",
  "ADMIN",
]);

export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const vendorStatusEnum = pgEnum("vendor_status", [
  "PENDING",
  "ACTIVE",
  "INACTIVE",
  "BLOCKED",
]);

export const rfqStatusEnum = pgEnum("rfq_status", [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "CANCELLED",
]);

export const quotationStatusEnum = pgEnum("quotation_status", [
  "DRAFT",
  "SUBMITTED",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const approvalHistoryActionEnum = pgEnum("approval_history_action", [
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "GENERATED",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "GENERATED",
]);

export const invoiceEmailDeliveryStatusEnum = pgEnum(
  "invoice_email_delivery_status",
  ["SENT", "FAILED"],
);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),

  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phoneNumber: text("phone_number").notNull(),
  passwordHash: text("password_hash").notNull(),

  role: userRoleEnum("role").notNull(),
  country: text("country").notNull(),

  photoUrl: text("photo_url"),
  additionalInformation: text("additional_information"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});

export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),

  vendorName: text("vendor_name").notNull(),
  category: text("category").notNull(),
  gstNumber: text("gst_number").unique(),

  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phoneNumber: text("phone_number").notNull(),

  status: vendorStatusEnum("status")
    .default("PENDING")
    .notNull(),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),

  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull(),
});

export const vendorUserMemberships = pgTable(
  "vendor_user_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),

    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("vendor_user_memberships_vendor_user_unique").on(
      table.vendorId,
      table.userId,
    ),
    unique("vendor_user_memberships_user_unique").on(table.userId),
    index("vendor_user_memberships_vendor_id_idx").on(table.vendorId),
  ],
);

export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    rfqNumber: text("rfq_number").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description"),
    status: rfqStatusEnum("status").default("DRAFT").notNull(),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),

    // Currency is shared by every quotation submitted for this RFQ.
    currency: text("currency").notNull(),

    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("rfqs_rfq_number_unique").on(table.rfqNumber),
    index("rfqs_created_by_user_id_idx").on(table.createdByUserId),
    index("rfqs_status_deadline_idx").on(table.status, table.deadline),
  ],
);

export const rfqLineItems = pgTable(
  "rfq_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),

    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("rfq_line_items_rfq_line_number_unique").on(
      table.rfqId,
      table.lineNumber,
    ),
    unique("rfq_line_items_id_rfq_unique").on(table.id, table.rfqId),
    check(
      "rfq_line_items_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
  ],
);

export const rfqAttachments = pgTable(
  "rfq_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),

    uploaderUserId: uuid("uploader_user_id")
      .notNull()
      .references(() => users.id),

    imagekitFileId: text("imagekit_file_id").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storagePath: text("storage_path").notNull().unique(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("rfq_attachments_rfq_id_idx").on(table.rfqId),
    index("rfq_attachments_uploader_user_id_idx").on(table.uploaderUserId),
    check("rfq_attachments_size_positive", sql`${table.size} > 0`),
  ],
);

export const rfqVendorAssignments = pgTable(
  "rfq_vendor_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    rfqId: uuid("rfq_id")
      .notNull()
      .references(() => rfqs.id, { onDelete: "cascade" }),

    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("rfq_vendor_assignments_rfq_vendor_unique").on(
      table.rfqId,
      table.vendorId,
    ),
    index("rfq_vendor_assignments_vendor_id_idx").on(table.vendorId),
  ],
);

export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    rfqId: uuid("rfq_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    status: quotationStatusEnum("status").default("DRAFT").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    // Optional while drafting; vendors may provide either or both when ready.
    deliveryTimeline: text("delivery_timeline"),
    notes: text("notes"),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("quotations_rfq_vendor_unique").on(table.rfqId, table.vendorId),
    unique("quotations_id_rfq_unique").on(table.id, table.rfqId),
    unique("quotations_id_rfq_vendor_unique").on(
      table.id,
      table.rfqId,
      table.vendorId,
    ),
    foreignKey({
      name: "quotations_rfq_vendor_assignment_fk",
      columns: [table.rfqId, table.vendorId],
      foreignColumns: [rfqVendorAssignments.rfqId, rfqVendorAssignments.vendorId],
    }),
    index("quotations_vendor_status_idx").on(table.vendorId, table.status),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    quotationId: uuid("quotation_id").notNull(),
    rfqId: uuid("rfq_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    selectedByUserId: uuid("selected_by_user_id")
      .notNull()
      .references(() => users.id),
    selectedAt: timestamp("selected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    status: approvalStatusEnum("status").default("PENDING").notNull(),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionRemarks: text("decision_remarks"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("approval_requests_quotation_id_unique").on(table.quotationId),
    unique("approval_requests_id_quotation_rfq_vendor_unique").on(
      table.id,
      table.quotationId,
      table.rfqId,
      table.vendorId,
    ),
    foreignKey({
      name: "approval_requests_quotation_rfq_vendor_fk",
      columns: [table.quotationId, table.rfqId, table.vendorId],
      foreignColumns: [quotations.id, quotations.rfqId, quotations.vendorId],
    }),
    index("approval_requests_rfq_status_idx").on(table.rfqId, table.status),
    index("approval_requests_status_selected_at_idx").on(
      table.status,
      table.selectedAt,
    ),
    uniqueIndex("approval_requests_one_active_rfq_selection_unique")
      .on(table.rfqId)
      .where(sql`${table.status} IN ('PENDING', 'APPROVED')`),
    check(
      "approval_requests_decision_fields_consistent",
      sql`(
        (${table.status} = 'PENDING' AND ${table.decidedByUserId} IS NULL AND ${table.decidedAt} IS NULL AND ${table.decisionRemarks} IS NULL)
        OR
        (${table.status} IN ('APPROVED', 'REJECTED') AND ${table.decidedByUserId} IS NOT NULL AND ${table.decidedAt} IS NOT NULL AND ${table.decisionRemarks} IS NOT NULL)
      )`,
    ),
  ],
);

export const approvalHistory = pgTable(
  "approval_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    approvalRequestId: uuid("approval_request_id")
      .notNull()
      .references(() => approvalRequests.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    action: approvalHistoryActionEnum("action").notNull(),
    remarks: text("remarks"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("approval_history_approval_request_occurred_at_idx").on(
      table.approvalRequestId,
      table.occurredAt,
    ),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    poNumber: text("po_number").notNull(),
    approvalRequestId: uuid("approval_request_id").notNull(),
    quotationId: uuid("quotation_id").notNull(),
    rfqId: uuid("rfq_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    generatedByUserId: uuid("generated_by_user_id")
      .notNull()
      .references(() => users.id),
    status: purchaseOrderStatusEnum("status").default("GENERATED").notNull(),
    currency: text("currency").notNull(),
    totalAmount: numeric("total_amount", { precision: 28, scale: 2 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("purchase_orders_po_number_unique").on(table.poNumber),
    unique("purchase_orders_approval_request_id_unique").on(
      table.approvalRequestId,
    ),
    unique("purchase_orders_quotation_id_unique").on(table.quotationId),
    unique("purchase_orders_id_rfq_unique").on(table.id, table.rfqId),
    unique("purchase_orders_id_vendor_unique").on(table.id, table.vendorId),
    foreignKey({
      name: "purchase_orders_approval_request_quotation_rfq_vendor_fk",
      columns: [
        table.approvalRequestId,
        table.quotationId,
        table.rfqId,
        table.vendorId,
      ],
      foreignColumns: [
        approvalRequests.id,
        approvalRequests.quotationId,
        approvalRequests.rfqId,
        approvalRequests.vendorId,
      ],
    }),
    foreignKey({
      name: "purchase_orders_quotation_rfq_vendor_fk",
      columns: [table.quotationId, table.rfqId, table.vendorId],
      foreignColumns: [quotations.id, quotations.rfqId, quotations.vendorId],
    }),
    index("purchase_orders_vendor_generated_at_idx").on(
      table.vendorId,
      table.generatedAt,
    ),
    index("purchase_orders_status_generated_at_idx").on(
      table.status,
      table.generatedAt,
    ),
    check(
      "purchase_orders_total_amount_non_negative",
      sql`${table.totalAmount} >= 0`,
    ),
  ],
);

export const purchaseOrderLineItems = pgTable(
  "purchase_order_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    purchaseOrderId: uuid("purchase_order_id")
      .notNull(),
    rfqId: uuid("rfq_id").notNull(),
    rfqLineItemId: uuid("rfq_line_item_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 28, scale: 2 }).notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("purchase_order_line_items_purchase_order_rfq_line_item_unique").on(
      table.purchaseOrderId,
      table.rfqLineItemId,
    ),
    unique("purchase_order_line_items_id_purchase_order_unique").on(
      table.id,
      table.purchaseOrderId,
    ),
    foreignKey({
      name: "purchase_order_line_items_purchase_order_rfq_fk",
      columns: [table.purchaseOrderId, table.rfqId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.rfqId],
    }).onDelete("cascade"),
    foreignKey({
      name: "purchase_order_line_items_rfq_line_item_rfq_fk",
      columns: [table.rfqLineItemId, table.rfqId],
      foreignColumns: [rfqLineItems.id, rfqLineItems.rfqId],
    }),
    index("purchase_order_line_items_purchase_order_id_idx").on(
      table.purchaseOrderId,
    ),
    check(
      "purchase_order_line_items_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
    check(
      "purchase_order_line_items_unit_price_non_negative",
      sql`${table.unitPrice} >= 0`,
    ),
    check(
      "purchase_order_line_items_line_total_non_negative",
      sql`${table.lineTotal} >= 0`,
    ),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    invoiceNumber: text("invoice_number").notNull(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    vendorId: uuid("vendor_id").notNull(),
    status: invoiceStatusEnum("status").default("GENERATED").notNull(),
    currency: text("currency").notNull(),
    subtotalAmount: numeric("subtotal_amount", { precision: 28, scale: 2 }).notNull(),
    gstRate: numeric("gst_rate", { precision: 7, scale: 4 }).notNull(),
    taxAmount: numeric("tax_amount", { precision: 28, scale: 2 }).notNull(),
    grandTotal: numeric("grand_total", { precision: 28, scale: 2 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoices_invoice_number_unique").on(table.invoiceNumber),
    unique("invoices_purchase_order_id_unique").on(table.purchaseOrderId),
    unique("invoices_id_purchase_order_unique").on(
      table.id,
      table.purchaseOrderId,
    ),
    foreignKey({
      name: "invoices_purchase_order_vendor_fk",
      columns: [table.purchaseOrderId, table.vendorId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.vendorId],
    }),
    index("invoices_vendor_issued_at_idx").on(table.vendorId, table.issuedAt),
    index("invoices_status_issued_at_idx").on(table.status, table.issuedAt),
    check(
      "invoices_subtotal_amount_non_negative",
      sql`${table.subtotalAmount} >= 0`,
    ),
    check(
      "invoices_gst_rate_valid",
      sql`${table.gstRate} >= 0 AND ${table.gstRate} <= 100`,
    ),
    check(
      "invoices_tax_amount_non_negative",
      sql`${table.taxAmount} >= 0`,
    ),
    check(
      "invoices_grand_total_non_negative",
      sql`${table.grandTotal} >= 0`,
    ),
    check(
      "invoices_grand_total_matches_components",
      sql`${table.grandTotal} = ${table.subtotalAmount} + ${table.taxAmount}`,
    ),
  ],
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    invoiceId: uuid("invoice_id").notNull(),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    purchaseOrderLineItemId: uuid("purchase_order_line_item_id").notNull(),
    lineNumber: integer("line_number").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 28, scale: 2 }).notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("invoice_line_items_invoice_purchase_order_line_item_unique").on(
      table.invoiceId,
      table.purchaseOrderLineItemId,
    ),
    foreignKey({
      name: "invoice_line_items_invoice_purchase_order_fk",
      columns: [table.invoiceId, table.purchaseOrderId],
      foreignColumns: [invoices.id, invoices.purchaseOrderId],
    }).onDelete("cascade"),
    foreignKey({
      name: "invoice_line_items_purchase_order_line_item_purchase_order_fk",
      columns: [table.purchaseOrderLineItemId, table.purchaseOrderId],
      foreignColumns: [purchaseOrderLineItems.id, purchaseOrderLineItems.purchaseOrderId],
    }),
    index("invoice_line_items_invoice_id_idx").on(table.invoiceId),
    check(
      "invoice_line_items_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
    check(
      "invoice_line_items_unit_price_non_negative",
      sql`${table.unitPrice} >= 0`,
    ),
    check(
      "invoice_line_items_line_total_non_negative",
      sql`${table.lineTotal} >= 0`,
    ),
  ],
);

export const invoiceEmailDeliveries = pgTable(
  "invoice_email_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    recipientEmail: text("recipient_email").notNull(),
    status: invoiceEmailDeliveryStatusEnum("status").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    failureReason: text("failure_reason"),
  },
  (table) => [
    index("invoice_email_deliveries_invoice_attempted_at_idx").on(
      table.invoiceId,
      table.attemptedAt,
    ),
    check(
      "invoice_email_deliveries_failure_reason_consistent",
      sql`(
        (${table.status} = 'SENT' AND ${table.failureReason} IS NULL)
        OR
        (${table.status} = 'FAILED' AND ${table.failureReason} IS NOT NULL)
      )`,
    ),
  ],
);

export const quotationLineItems = pgTable(
  "quotation_line_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    quotationId: uuid("quotation_id").notNull(),
    rfqId: uuid("rfq_id").notNull(),
    rfqLineItemId: uuid("rfq_line_item_id").notNull(),

    // Monetary amounts use numeric(14,2) and are returned by Drizzle as strings.
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),

    createdAt: timestamp("created_at")
      .defaultNow()
      .notNull(),

    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("quotation_line_items_quotation_rfq_line_item_unique").on(
      table.quotationId,
      table.rfqLineItemId,
    ),
    foreignKey({
      name: "quotation_line_items_quotation_rfq_fk",
      columns: [table.quotationId, table.rfqId],
      foreignColumns: [quotations.id, quotations.rfqId],
    }).onDelete("cascade"),
    foreignKey({
      name: "quotation_line_items_rfq_line_item_rfq_fk",
      columns: [table.rfqLineItemId, table.rfqId],
      foreignColumns: [rfqLineItems.id, rfqLineItems.rfqId],
    }),
    index("quotation_line_items_rfq_line_item_id_idx").on(table.rfqLineItemId),
    check(
      "quotation_line_items_unit_price_non_negative",
      sql`${table.unitPrice} >= 0`,
    ),
  ],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  tokenHash: text("token_hash").notNull().unique(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});


export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  tokenHash: text("token_hash").notNull().unique(),

  expiresAt: timestamp("expires_at", {
    withTimezone: true,
  }).notNull(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .defaultNow()
    .notNull(),
});
