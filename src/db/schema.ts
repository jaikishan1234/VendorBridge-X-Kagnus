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