import { User, UserRole } from '../models/user.model';

function getRouteForRole(role: UserRole | undefined): string[] {
  switch (role) {
    case 'MERCHANT':
      return ['/merchant'];
    case 'ADMIN':
      return ['/admin-space'];
    case 'CUSTOMER':
    default:
      return ['/dashboard'];
  }
}

export function getDefaultAuthenticatedRoute(
  user: Pick<User, 'role'> | null | undefined,
): string[] {
  return getRouteForRole(user?.role);
}
