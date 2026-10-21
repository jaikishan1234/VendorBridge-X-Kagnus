"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!identifier.trim()) {
      setError("Enter your username or email.");
      return;
    }

    if (!password) {
      setError("Enter your password.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(
          getResponseMessage(payload) ??
            "We could not log you in. Check your details and try again.",
        );
        return;
      }

      router.replace("/dashboard");
    } catch {
      setError("Unable to reach VendorBridge. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearError() {
    if (error) {
      setError(null);
    }
  }

  return (
    <form
      className="rounded-[6px] border border-[#6e6e6e] bg-[#151515] px-6 py-10 shadow-[0_0_0_1px_rgba(255,255,255,0.02)] sm:px-8 sm:py-11"
      noValidate
      onSubmit={handleSubmit}
    >
      <div
        aria-hidden="true"
        className="mx-auto flex size-16 items-center justify-center rounded-full border border-[#8a8a8a] text-xs text-[#dddddd] sm:size-[68px]"
      >
        Photo
      </div>

      <div className="mt-10 space-y-4">
        <div>
          <Label className="sr-only" htmlFor="identifier">
            Username or email
          </Label>
          <Input
            autoComplete="username"
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
            className="h-12 w-full rounded-[4px] border border-[#777777] bg-transparent px-4 text-sm text-[#ededed] outline-none placeholder:text-[#b7b7b7] focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25 dark:bg-transparent"
            disabled={isSubmitting}
            id="identifier"
            name="identifier"
            onChange={(event) => {
              setIdentifier(event.target.value);
              clearError();
            }}
            placeholder="Username"
            required
            type="text"
            value={identifier}
          />
        </div>

        <div className="relative">
          <Label className="sr-only" htmlFor="password">
            Password
          </Label>
          <Input
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={Boolean(error)}
            autoComplete="current-password"
            className="h-12 w-full rounded-[4px] border border-[#777777] bg-transparent py-0 pl-4 pr-12 text-sm text-[#ededed] outline-none placeholder:text-[#b7b7b7] focus:border-[#e0e0e0] focus:ring-2 focus:ring-[#d8d8d8]/25 dark:bg-transparent"
            disabled={isSubmitting}
            id="password"
            name="password"
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            placeholder="Password"
            required
            type={isPasswordVisible ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
            aria-pressed={isPasswordVisible}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[4px] text-[#b7b7b7] outline-none transition-colors hover:text-[#f1f1f1] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d8d8d8]/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="17"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              width="17"
            >
              {isPasswordVisible ? (
                <>
                  <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                  <circle cx="12" cy="12" r="2.5" />
                </>
              ) : (
                <>
                  <path d="m3 3 18 18" />
                  <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a18.2 18.2 0 0 1-3.1 3.7" />
                  <path d="M6.2 6.2A18.4 18.4 0 0 0 2.5 12S6 18 12 18c1.5 0 2.8-.4 4-1" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {error ? (
        <p
          className="mt-4 text-center text-sm leading-5 text-[#f19a9a]"
          id="login-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-7 flex flex-col items-center gap-4">
        <Button
          className="h-11 min-w-24 rounded-[4px] border-[#8a8a8a] bg-transparent px-6 text-sm font-medium text-[#efefef] hover:border-[#d4d4d4] hover:bg-[#252525] focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50 dark:border-[#8a8a8a] dark:bg-transparent dark:text-[#efefef] dark:hover:bg-[#252525] disabled:cursor-wait"
          disabled={isSubmitting}
          type="submit"
          variant="outline"
        >
          {isSubmitting ? "Logging in…" : "Login"}
        </Button>
        <p className="text-sm text-[#b7b7b7]">
          Don&apos;t have an account?{" "}
          <Link
            className="underline-offset-4 transition-colors hover:text-[#efefef] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/50"
            href="/register"
          >
            Create an account
          </Link>
        </p>
      </div>
    </form>
  );
}
