export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-[100dvh] items-center justify-center bg-[#111111] p-6 text-[#e8e8e8]"
    >
      <div className="w-full max-w-sm rounded-[7px] border border-[#777777] bg-[#151515] p-5">
        <p className="text-sm font-medium">Loading VendorBridge…</p>
        <p className="mt-2 text-sm text-[#b7b7b7]">Retrieving the latest authorized records.</p>
      </div>
    </main>
  );
}
