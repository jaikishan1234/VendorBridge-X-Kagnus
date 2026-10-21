import { z } from "zod";

export const createVendorSchema = z.object({
  vendorName: z.string().trim().min(1, "Vendor name is required.").max(200),
  category: z.string().trim().min(1, "Category is required.").max(100),
  gstNumber: z.string().trim().max(50).optional().or(z.literal("")),
  contactName: z.string().trim().min(1, "Contact name is required.").max(200),
  email: z.string().trim().email("Enter a valid email address.").max(255),
  phoneNumber: z.string().trim().min(7, "Phone number is too short.").max(20),
});
