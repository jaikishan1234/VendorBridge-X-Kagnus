import type { z } from "zod";
import type { registrationFormSchema } from "@/lib/validations/auth";

export type RegistrationValues = z.infer<typeof registrationFormSchema>;

export type FieldErrors = Partial<Record<keyof RegistrationValues, string>>;
