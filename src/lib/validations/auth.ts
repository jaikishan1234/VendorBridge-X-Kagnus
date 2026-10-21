
import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(30),

  email: z.string().trim().email().max(255),

  firstName: z.string().trim().min(1).max(100),

  lastName: z.string().trim().min(1).max(100),

  phoneNumber: z.string().trim().min(7).max(20),

  password: z.string().min(8).max(128),

  country: z.string().trim().min(1).max(100),

  photoUrl: z.string().trim().url().optional().or(z.literal("")),

  additionalInformation: z.string().trim().max(1000).optional(),

});

export const registrationFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(255),
});

export type LoginInput = z.infer<typeof loginSchema>;
