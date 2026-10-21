"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldErrors, RegistrationValues } from "@/types/auth";

type RegistrationFieldsProps = {
  values: RegistrationValues;
  fieldErrors: FieldErrors;
  isSubmitting: boolean;
  onFieldChange: (field: keyof RegistrationValues, value: string) => void;
};

const inputClassName =
  "h-12 w-full rounded-[4px] border border-[#777777] bg-transparent px-4 text-sm text-[#ededed] outline-none placeholder:text-[#b7b7b7] focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25 dark:bg-transparent";

export function RegistrationFields({
  values,
  fieldErrors,
  isSubmitting,
  onFieldChange,
}: RegistrationFieldsProps) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
      <div>
        <Label className="sr-only" htmlFor="firstName">
          First Name
        </Label>
        <Input
          aria-describedby={
            fieldErrors.firstName ? "firstName-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.firstName)}
          autoComplete="given-name"
          className={inputClassName}
          disabled={isSubmitting}
          id="firstName"
          name="firstName"
          onChange={(event) => onFieldChange("firstName", event.target.value)}
          placeholder="First Name"
          required
          type="text"
          value={values.firstName}
        />
        {fieldErrors.firstName ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="firstName-error">
            {fieldErrors.firstName}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="sr-only" htmlFor="lastName">
          Last Name
        </Label>
        <Input
          aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
          aria-invalid={Boolean(fieldErrors.lastName)}
          autoComplete="family-name"
          className={inputClassName}
          disabled={isSubmitting}
          id="lastName"
          name="lastName"
          onChange={(event) => onFieldChange("lastName", event.target.value)}
          placeholder="Last Name"
          required
          type="text"
          value={values.lastName}
        />
        {fieldErrors.lastName ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="lastName-error">
            {fieldErrors.lastName}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="sr-only" htmlFor="email">
          Email Address
        </Label>
        <Input
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          aria-invalid={Boolean(fieldErrors.email)}
          autoComplete="email"
          className={inputClassName}
          disabled={isSubmitting}
          id="email"
          name="email"
          onChange={(event) => onFieldChange("email", event.target.value)}
          placeholder="Email Address"
          required
          type="email"
          value={values.email}
        />
        {fieldErrors.email ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="email-error">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="sr-only" htmlFor="phoneNumber">
          Phone Number
        </Label>
        <Input
          aria-describedby={
            fieldErrors.phoneNumber ? "phoneNumber-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.phoneNumber)}
          autoComplete="tel"
          className={inputClassName}
          disabled={isSubmitting}
          id="phoneNumber"
          name="phoneNumber"
          onChange={(event) =>
            onFieldChange("phoneNumber", event.target.value)
          }
          placeholder="Phone Number"
          required
          type="tel"
          value={values.phoneNumber}
        />
        {fieldErrors.phoneNumber ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="phoneNumber-error">
            {fieldErrors.phoneNumber}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="sr-only" htmlFor="role">
          Role
        </Label>
        <Input
          aria-readonly="true"
          className={`${inputClassName} cursor-default text-[#b7b7b7]`}
          id="role"
          readOnly
          tabIndex={-1}
          type="text"
          value="Vendor"
        />
      </div>

      <div>
        <Label className="sr-only" htmlFor="country">
          Country
        </Label>
        <Input
          aria-describedby={fieldErrors.country ? "country-error" : undefined}
          aria-invalid={Boolean(fieldErrors.country)}
          autoComplete="country-name"
          className={inputClassName}
          disabled={isSubmitting}
          id="country"
          name="country"
          onChange={(event) => onFieldChange("country", event.target.value)}
          placeholder="Country"
          required
          type="text"
          value={values.country}
        />
        {fieldErrors.country ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="country-error">
            {fieldErrors.country}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="sr-only" htmlFor="username">
          Username
        </Label>
        <Input
          aria-describedby={fieldErrors.username ? "username-error" : undefined}
          aria-invalid={Boolean(fieldErrors.username)}
          autoComplete="username"
          className={inputClassName}
          disabled={isSubmitting}
          id="username"
          name="username"
          onChange={(event) => onFieldChange("username", event.target.value)}
          placeholder="Username"
          required
          type="text"
          value={values.username}
        />
        {fieldErrors.username ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="username-error">
            {fieldErrors.username}
          </p>
        ) : null}
      </div>

      <div>
        <Label className="sr-only" htmlFor="password">
          Password
        </Label>
        <Input
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          aria-invalid={Boolean(fieldErrors.password)}
          autoComplete="new-password"
          className={inputClassName}
          disabled={isSubmitting}
          id="password"
          name="password"
          onChange={(event) => onFieldChange("password", event.target.value)}
          placeholder="Password"
          required
          type="password"
          value={values.password}
        />
        {fieldErrors.password ? (
          <p className="mt-1 text-xs text-[#f19a9a]" id="password-error">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <Label className="sr-only" htmlFor="confirmPassword">
          Confirm Password
        </Label>
        <Input
          aria-describedby={
            fieldErrors.confirmPassword ? "confirmPassword-error" : undefined
          }
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
          autoComplete="new-password"
          className={inputClassName}
          disabled={isSubmitting}
          id="confirmPassword"
          name="confirmPassword"
          onChange={(event) =>
            onFieldChange("confirmPassword", event.target.value)
          }
          placeholder="Confirm Password"
          required
          type="password"
          value={values.confirmPassword}
        />
        {fieldErrors.confirmPassword ? (
          <p
            className="mt-1 text-xs text-[#f19a9a]"
            id="confirmPassword-error"
          >
            {fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <div className="sm:col-span-2">
        <Label className="sr-only" htmlFor="additionalInformation">
          Additional Information
        </Label>
        <textarea
          aria-describedby={
            fieldErrors.additionalInformation
              ? "additionalInformation-error"
              : undefined
          }
          aria-invalid={Boolean(fieldErrors.additionalInformation)}
          className="min-h-28 w-full resize-y rounded-[4px] border border-[#777777] bg-transparent px-4 py-3 text-sm text-[#ededed] outline-none placeholder:text-[#b7b7b7] focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25"
          disabled={isSubmitting}
          id="additionalInformation"
          maxLength={1000}
          name="additionalInformation"
          onChange={(event) =>
            onFieldChange("additionalInformation", event.target.value)
          }
          placeholder="Additional Information ..."
          value={values.additionalInformation}
        />
        {fieldErrors.additionalInformation ? (
          <p
            className="mt-1 text-xs text-[#f19a9a]"
            id="additionalInformation-error"
          >
            {fieldErrors.additionalInformation}
          </p>
        ) : null}
      </div>
    </div>
  );
}
