import { User, UserRole } from '../models/user.model';

function getRouteForRole(
  role: UserRole | undefined,
  merchantAccessState: User['merchantAccessState'] | undefined,
): string[] {
  switch (role) {
    case 'MERCHANT':
      if (merchantAccessState !== 'APPROVED') {
        return ['/merchant-onboarding'];
      }
      return ['/merchant'];
    case 'ADMIN':
      return ['/admin-space'];
    case 'CUSTOMER':
    default:
      return ['/dashboard'];
  }
}

export function getDefaultAuthenticatedRoute(
  user: Pick<User, 'role' | 'merchantAccessState'> | null | undefined,
): string[] {
  return getRouteForRole(user?.role, user?.merchantAccessState);
}
