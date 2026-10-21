"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ZodError } from "zod";
import { RegistrationFields } from "@/components/auth/registration-fields";
import { Button } from "@/components/ui/button";
import { registrationFormSchema } from "@/lib/validations/auth";
import type { FieldErrors, RegistrationValues } from "@/types/auth";

const initialRegistrationValues: RegistrationValues = {
  firstName: "",
  lastName: "",
  email: "",
  phoneNumber: "",
  username: "",
  country: "",
  password: "",
  confirmPassword: "",
  additionalInformation: "",
};

function getResponseMessage(payload: unknown): string | undefined {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return undefined;
}

function getFieldErrors(error: ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    switch (field) {
      case "firstName":
        if (!fieldErrors.firstName) fieldErrors.firstName = issue.message;
        break;
      case "lastName":
        if (!fieldErrors.lastName) fieldErrors.lastName = issue.message;
        break;
      case "email":
        if (!fieldErrors.email) fieldErrors.email = issue.message;
        break;
      case "phoneNumber":
        if (!fieldErrors.phoneNumber) fieldErrors.phoneNumber = issue.message;
        break;
      case "username":
        if (!fieldErrors.username) fieldErrors.username = issue.message;
        break;
      case "country":
        if (!fieldErrors.country) fieldErrors.country = issue.message;
        break;
      case "password":
        if (!fieldErrors.password) fieldErrors.password = issue.message;
        break;
      case "confirmPassword":
        if (!fieldErrors.confirmPassword) {
          fieldErrors.confirmPassword = issue.message;
        }
        break;
      case "additionalInformation":
        if (!fieldErrors.additionalInformation) {
          fieldErrors.additionalInformation = issue.message;
        }
        break;
    }
  }

  return fieldErrors;
}

export function RegistrationForm() {
  const [values, setValues] = useState<RegistrationValues>(
    initialRegistrationValues,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof RegistrationValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const result = registrationFormSchema.safeParse(values);

    if (!result.success) {
      setFieldErrors(getFieldErrors(result.error));
      setFormError("Review the highlighted fields and try again.");
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: result.data.username,
          email: result.data.email,
          firstName: result.data.firstName,
          lastName: result.data.lastName,
          phoneNumber: result.data.phoneNumber,
          password: result.data.password,
          country: result.data.country,
          additionalInformation: result.data.additionalInformation,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(
          getResponseMessage(payload) ??
            "We could not complete your registration. Please try again.",
        );
        return;
      }

      setSuccessMessage("Registration successful. You can now log in.");
    } catch {
      setFormError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (successMessage) {
    return (
      <div className="rounded-[6px] border border-[#6e6e6e] bg-[#151515] px-6 py-10 text-center shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:px-8 sm:py-11">
        <div
          aria-hidden="true"
          className="mx-auto flex size-16 items-center justify-center rounded-full border border-[#8a8a8a] text-xs text-[#dddddd] sm:size-[68px]"
        >
          Photo
        </div>
        <p className="mt-8 text-sm leading-6 text-[#c6e5cf]" role="status">
          {successMessage}
        </p>
        <Link
          className="mt-6 inline-flex h-11 min-w-28 items-center justify-center rounded-[4px] border border-[#8a8a8a] px-6 text-sm font-medium text-[#efefef] transition-colors hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
          href="/login"
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <form
      className="rounded-[6px] border border-[#6e6e6e] bg-[#151515] px-6 py-8 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:px-8 sm:py-10"
      noValidate
      onSubmit={handleSubmit}
    >
      <div
        aria-hidden="true"
        className="mx-auto flex size-16 items-center justify-center rounded-full border border-[#8a8a8a] text-xs text-[#dddddd] sm:size-[68px]"
      >
        Photo
      </div>

      <RegistrationFields
        fieldErrors={fieldErrors}
        isSubmitting={isSubmitting}
        onFieldChange={updateField}
        values={values}
      />

      {formError ? (
        <p className="mt-4 text-center text-sm leading-5 text-[#f19a9a]" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="mt-7 flex flex-col items-center gap-4">
        <Button
          className="h-11 min-w-28 rounded-[4px] border-[#8a8a8a] bg-transparent px-6 text-sm font-medium text-[#efefef] hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50 dark:border-[#8a8a8a] dark:bg-transparent dark:text-[#efefef] dark:hover:bg-[#252525] disabled:cursor-wait"
          disabled={isSubmitting}
          type="submit"
          variant="outline"
        >
          {isSubmitting ? "Registering..." : "Register"}
        </Button>
        <Link
          className="text-sm text-[#b7b7b7] underline-offset-4 transition-colors hover:text-[#efefef] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
          href="/login"
        >
          Back to Login
        </Link>
      </div>
    </form>
  );
}
