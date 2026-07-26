import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const merchantOnboardingGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.currentUser();

  if (!user || user.role !== 'MERCHANT') {
    return router.createUrlTree(['/login']);
  }

  if (user.merchantAccessState === 'APPROVED') {
    return router.createUrlTree(['/merchant']);
  }

  return true;
};
