import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "PROCUREMENT_OFFICER",
  "VENDOR",
  "MANAGER",
  "ADMIN",
]);

export const vendorStatusEnum = pgEnum("vendor_status", [
  "PENDING",
  "ACTIVE",
  "INACTIVE",
  "BLOCKED",
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