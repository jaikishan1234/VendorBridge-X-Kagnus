"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorPage({ error, retry }: ErrorPageProps) {
  useEffect(() => {
    console.error("Application render error:", error);
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#111111] p-6 text-[#e8e8e8]">
      <section className="w-full max-w-md rounded-[7px] border border-[#9e5a5a] bg-[#2a1717] p-6">
        <h1 className="text-xl font-medium">Unable to load this page</h1>
        <p className="mt-2 text-sm leading-6 text-[#f0c9c9]">
          The request could not be completed. Please try again; if the issue continues, contact your procurement administrator.
        </p>
        <button
          className="mt-5 h-10 rounded-[5px] border border-[#d8d8d8] px-4 text-sm font-medium text-[#f2f2f2] transition-colors hover:bg-[#3a2020] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/60"
          onClick={retry}
          type="button"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
