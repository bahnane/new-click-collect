import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { publicOnlyGuard } from './core/guards/public-only.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/app-shell/app-shell.component').then(
        (m) => m.AppShellComponent,
      ),
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
        title: 'routes.dashboard.title',
      },
      {
        path: 'merchant-space',
        canActivate: [roleGuard(['MERCHANT'])],
        loadComponent: () =>
          import('./features/merchant-space/merchant-space.component').then(
            (m) => m.MerchantSpaceComponent,
          ),
        title: 'routes.merchantSpace.title',
      },
      {
        path: 'admin-space',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/admin-space/admin-space.component').then(
            (m) => m.AdminSpaceComponent,
          ),
        title: 'routes.adminSpace.title',
      },
    ],
  },
  {
    path: 'activate-invite',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/activate-invite/activate-invite.component').then(
        (m) => m.ActivateInviteComponent,
      ),
    title: 'routes.activateInvite.title',
  },
  {
    path: 'verify-email',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.component').then(
        (m) => m.VerifyEmailComponent,
      ),
    title: 'routes.verifyEmail.title',
  },
  {
    path: 'forgot-password',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
    title: 'routes.forgotPassword.title',
  },
  {
    path: 'reset-password',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
    title: 'routes.resetPassword.title',
  },
  {
    path: 'register',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/register/register.component').then(
        (m) => m.RegisterComponent,
      ),
    title: 'routes.register.title',
  },
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then(
        (m) => m.LoginComponent,
      ),
    title: 'routes.login.title',
  },
  {
    path: 'shop/:merchantId',
    loadComponent: () =>
      import('./features/shop/merchant-shop/merchant-shop.component').then(
        (m) => m.MerchantShopComponent,
      ),
    title: 'routes.merchantShop.title',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
