import type { UserRole } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";


export function hasRole(
  userRole: UserRole,
  allowedRoles: UserRole[],
): boolean {
  return allowedRoles.includes(userRole);
}

export type AuthorizationResult =
  | { authorized: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { authorized: false; status: 401 | 403 };


export async function requireRole(
  allowedRoles: UserRole[],
): Promise<AuthorizationResult> {
  const user = await getCurrentUser();

  if (!user) {
    return { authorized: false, status: 401 };
  }

  if (!hasRole(user.role, allowedRoles)) {
    return { authorized: false, status: 403 };
  }

  return { authorized: true, user };
}
