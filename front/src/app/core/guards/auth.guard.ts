import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const requireApprovedMerchant =
    route.data?.['requireApprovedMerchant'] === true;

  const resolveAccess = () => {
    const user = authService.currentUser();

    if (
      requireApprovedMerchant &&
      user?.role === 'MERCHANT' &&
      user.merchantAccessState !== 'APPROVED'
    ) {
      return router.createUrlTree(['/merchant-onboarding']);
    }

    return true;
  };

  if (authService.isAuthenticated()) {
    return resolveAccess();
  }

  return authService.refreshAccessToken().pipe(
    map((token) => {
      if (!token) {
        return router.createUrlTree(['/login']);
      }

      return resolveAccess();
    }),
  );
};
