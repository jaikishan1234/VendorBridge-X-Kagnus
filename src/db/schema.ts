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
    foreignKey({
      name: "quotations_rfq_vendor_assignment_fk",
      columns: [table.rfqId, table.vendorId],
      foreignColumns: [rfqVendorAssignments.rfqId, rfqVendorAssignments.vendorId],
    }),
    index("quotations_vendor_status_idx").on(table.vendorId, table.status),
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
