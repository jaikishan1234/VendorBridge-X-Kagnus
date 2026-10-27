import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vendorUserMemberships } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type RfqViewer =
  | { kind: "unauthenticated" }
  | { kind: "forbidden"; user: CurrentUser }
  | { kind: "procurement"; user: CurrentUser }
  | { kind: "vendor"; user: CurrentUser; vendorId: string }
  | { kind: "unlinked-vendor"; user: CurrentUser };

export async function getRfqViewer(): Promise<RfqViewer> {
  const user = await getCurrentUser();

  if (!user) {
    return { kind: "unauthenticated" };
  }

  if (user.role === "PROCUREMENT_OFFICER") {
    return { kind: "procurement", user };
  }

  if (user.role !== "VENDOR") {
    return { kind: "forbidden", user };
  }

  const [membership] = await db
    .select({ vendorId: vendorUserMemberships.vendorId })
    .from(vendorUserMemberships)
    .where(eq(vendorUserMemberships.userId, user.id))
    .limit(1);

  if (!membership) {
    return { kind: "unlinked-vendor", user };
  }

  return { kind: "vendor", user, vendorId: membership.vendorId };
}
