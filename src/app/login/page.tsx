import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Login | VendorBridge",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#111111] px-5 py-10 text-[#e8e8e8] sm:px-8">
      <section aria-labelledby="login-heading" className="w-full max-w-[400px]">
        <h1 id="login-heading" className="sr-only">
          Log in to VendorBridge
        </h1>
        <LoginForm />
      </section>
    </main>
  );
}
