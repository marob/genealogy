import type { Role } from '@genealogie/shared';

/** Authenticated user attached to the request. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  canSeeContemporary: boolean;
}

function isAdmin(user: AuthUser | undefined): boolean {
  return user?.role === 'ADMIN';
}

/** Permission to view the details of persons born less than 100 years ago. */
export function canSeeContemporary(user: AuthUser | undefined): boolean {
  return isAdmin(user) || !!user?.canSeeContemporary;
}
