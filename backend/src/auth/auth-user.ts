import type { Role } from '@genealogie/shared';

/** Utilisateur authentifié attaché à la requête. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  canSeeContemporary: boolean;
}

function isAdmin(user: AuthUser | undefined): boolean {
  return user?.role === 'ADMIN';
}

/** Droit de voir le détail des personnes nées il y a moins de 100 ans. */
export function canSeeContemporary(user: AuthUser | undefined): boolean {
  return isAdmin(user) || !!user?.canSeeContemporary;
}
