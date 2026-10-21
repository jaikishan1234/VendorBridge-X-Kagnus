import type { Metadata } from "next";
import { RegistrationForm } from "@/components/auth/registration-form";

export const metadata: Metadata = {
  title: "Register | VendorBridge",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#111111] px-5 py-8 text-[#e8e8e8] sm:px-8">
      <section aria-labelledby="register-heading" className="w-full max-w-[620px]">
        <h1 id="register-heading" className="sr-only">
          Register for VendorBridge
        </h1>
        <RegistrationForm />
      </section>
    </main>
  );
}
