"use client";

import { useEffect } from "react";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error("Global application render error:", error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body style={{ margin: 0, background: "#111111", color: "#e8e8e8", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <main style={{ alignItems: "center", display: "flex", justifyContent: "center", minHeight: "100dvh", padding: "24px" }}>
          <section style={{ background: "#2a1717", border: "1px solid #9e5a5a", borderRadius: "7px", maxWidth: "448px", padding: "24px", width: "100%" }}>
            <h1 style={{ fontSize: "20px", margin: 0 }}>Unable to load VendorBridge</h1>
            <p style={{ color: "#f0c9c9", lineHeight: 1.5, margin: "12px 0 0" }}>
              Please try again. If the issue continues, contact your procurement administrator.
            </p>
            <button
              onClick={retry}
              style={{ background: "transparent", border: "1px solid #d8d8d8", borderRadius: "5px", color: "#f2f2f2", cursor: "pointer", marginTop: "20px", padding: "10px 16px" }}
              type="button"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
