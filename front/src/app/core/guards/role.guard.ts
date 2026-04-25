import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { map } from 'rxjs';
import { UserRole } from '../models/user.model';
import { AuthService } from '../services/auth.service';

export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const user = authService.currentUser();
    if (user) {
      return allowedRoles.includes(user.role)
        ? true
        : router.createUrlTree(['/dashboard']);
    }

    return authService.refreshAccessToken().pipe(
      map(() => {
        const refreshedUser = authService.currentUser();
        if (!refreshedUser) {
          return router.createUrlTree(['/login']);
        }

        return allowedRoles.includes(refreshedUser.role)
          ? true
          : router.createUrlTree(['/dashboard']);
      }),
    );
  };
}
