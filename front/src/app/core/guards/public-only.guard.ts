import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { getDefaultAuthenticatedRoute } from '../utils/default-auth-route.util';

export const publicOnlyGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return router.createUrlTree(
      getDefaultAuthenticatedRoute(authService.currentUser()),
    );
  }

  return true;
};
