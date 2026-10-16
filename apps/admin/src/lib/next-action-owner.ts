import type { InternalRole, NextActionOwner } from '@aidn/shared';
import { useAuth } from '../hooks/useAuth';

/** Display decision mirroring the route guard; the API still enforces it. */
export function canAct(owner: NextActionOwner | null | undefined, userRoles: readonly InternalRole[]): boolean {
  return owner?.kind === 'staff' && (owner.roles ?? []).some((role) => userRoles.includes(role));
}

export function useCanAct(owner: NextActionOwner | null | undefined): boolean {
  const { user } = useAuth();
  return canAct(owner, user?.roles ?? []);
}
