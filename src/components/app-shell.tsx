import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/logout-button";
import type { UserRole } from "@/db/schema";

type AppShellUser = {
  username: string;
  email: string;
  role: UserRole;
};

type AppShellProps = {
  user: AppShellUser;
  activeItem: "Dashboard" | "Vendors" | "RFQs";
  children: ReactNode;
};

const navigationItems = [
  "Dashboard",
  "Vendors",
  "RFQs",
  "Quotations",
  "Approvals",
  "Purchase Orders",
  "Invoices",
  "Reports",
  "Activity",
];

function navigationHref(item: string) {
  if (item === "Dashboard") return "/dashboard";
  if (item === "Vendors") return "/vendors";
  if (item === "RFQs") return "/rfqs";

  return `/dashboard?comingSoon=${encodeURIComponent(item)}`;
}

export function AppShell({ user, activeItem, children }: AppShellProps) {
  const avatarLetter = user.username.charAt(0).toUpperCase();

  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-[#111111] text-[#e8e8e8]">
      <div className="flex min-h-[100dvh] w-full flex-col bg-[#111111]">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#8a8a8a] bg-[#082820] px-4 sm:px-6">
          <Link
            className="text-sm font-medium tracking-tight text-[#f1f1f1] outline-none focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/60"
            href="/dashboard"
          >
            VendorBridge
          </Link>
          <div className="flex items-center gap-3">
            <LogoutButton />
            <div
              aria-label={`Signed in as ${user.username}`}
              className="flex size-8 items-center justify-center rounded-full border border-[#b7b7b7] text-xs font-medium text-[#e8e8e8]"
              title={user.email}
            >
              {avatarLetter}
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col md:flex-row">
          <aside className="border-b border-[#8a8a8a] p-3 md:w-56 md:shrink-0 md:border-r md:border-b-0 md:p-4">
            <nav aria-label="Primary navigation" className="grid grid-cols-2 gap-1 md:block">
              {navigationItems.map((item) => {
                const isActive = item === activeItem;

                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`block rounded-[4px] px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#d8d8d8]/60 md:mb-1 ${
                      isActive
                        ? "bg-[#087020] text-[#f2f2f2]"
                        : "text-[#d6d6d6] hover:bg-[#252525]"
                    }`}
                    href={navigationHref(item)}
                    key={item}
                  >
                    <span aria-hidden="true" className="mr-2 text-[#b7b7b7]">
                      -
                    </span>
                    {item}
                  </Link>
                );
              })}
            </nav>
          </aside>

          {children}
        </div>
      </div>
    </main>
  );
}
