import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { merchantOnboardingGuard } from './core/guards/merchant-onboarding.guard';
import { publicOnlyGuard } from './core/guards/public-only.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    data: { requireApprovedMerchant: true },
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
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
        title: 'routes.dashboard.title',
      },
      {
        path: 'dashboard/orders',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
        title: 'routes.dashboard.title',
      },
      {
        path: 'account',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/account/account-home/account-home.component').then(
            (m) => m.AccountHomeComponent,
          ),
        title: 'routes.account.title',
        data: { accountScope: 'customer' },
      },
      {
        path: 'account/security',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/account/account-security/account-security.component').then(
            (m) => m.AccountSecurityComponent,
          ),
        title: 'routes.accountSecurity.title',
        data: { accountScope: 'customer' },
      },
      {
        path: 'account/language',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/account/account-language/account-language.component').then(
            (m) => m.AccountLanguageComponent,
          ),
        title: 'routes.accountLanguage.title',
        data: { accountScope: 'customer' },
      },
      {
        path: 'cart',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/cart/cart.component').then((m) => m.CartComponent),
        title: 'routes.cart.title',
      },
      {
        path: 'order-confirmation/:id',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/order-confirmation/order-confirmation.component').then(
            (m) => m.OrderConfirmationComponent,
          ),
        title: 'routes.orderConfirmation.title',
      },
      {
        path: 'detail-commande/:id',
        canActivate: [roleGuard(['CUSTOMER'])],
        loadComponent: () =>
          import('./features/order-detail/order-detail.component').then(
            (m) => m.OrderDetailComponent,
          ),
        title: 'routes.orderDetail.title',
      },
      {
        path: 'merchant',
        canActivate: [roleGuard(['MERCHANT'])],
        loadComponent: () =>
          import('./features/merchant-space/merchant-space.component').then(
            (m) => m.MerchantSpaceComponent,
          ),
        title: 'routes.merchant.title',
        children: [
          {
            path: '',
            redirectTo: 'overview',
            pathMatch: 'full',
          },
          {
            path: 'overview',
            loadComponent: () =>
              import('./features/merchant-space/merchant-overview/merchant-overview.component').then(
                (m) => m.MerchantOverviewComponent,
              ),
            title: 'routes.merchantOverview.title',
          },
          {
            path: 'account',
            loadComponent: () =>
              import('./features/account/account-home/account-home.component').then(
                (m) => m.AccountHomeComponent,
              ),
            title: 'routes.account.title',
            data: { accountScope: 'merchant' },
          },
          {
            path: 'account/store-profile',
            loadComponent: () =>
              import('./features/merchant-space/merchant-profile/merchant-profile.component').then(
                (m) => m.MerchantProfileComponent,
              ),
            title: 'routes.merchantProfile.title',
          },
          {
            path: 'account/security',
            loadComponent: () =>
              import('./features/account/account-security/account-security.component').then(
                (m) => m.AccountSecurityComponent,
              ),
            title: 'routes.accountSecurity.title',
            data: { accountScope: 'merchant' },
          },
          {
            path: 'account/language',
            loadComponent: () =>
              import('./features/account/account-language/account-language.component').then(
                (m) => m.AccountLanguageComponent,
              ),
            title: 'routes.accountLanguage.title',
            data: { accountScope: 'merchant' },
          },
          {
            path: 'store-offers',
            loadComponent: () =>
              import('./features/merchant-space/merchant-store-offers-page/merchant-store-offers-page.component').then(
                (m) => m.MerchantStoreOffersPageComponent,
              ),
            title: 'routes.merchantStoreOffers.title',
            children: [
              {
                path: '',
                redirectTo: 'my',
                pathMatch: 'full',
              },
              {
                path: 'my',
                loadComponent: () =>
                  import('./features/merchant-space/merchant-store-offers/merchant-store-offers.component').then(
                    (m) => m.MerchantStoreOffersComponent,
                  ),
                title: 'routes.merchantStoreOffers.title',
              },
              {
                path: 'add',
                loadComponent: () =>
                  import('./features/merchant-space/merchant-store-offers-create/merchant-store-offers-create.component').then(
                    (m) => m.MerchantStoreOffersCreateComponent,
                  ),
                title: 'routes.merchantStoreOffersCreate.title',
              },
            ],
          },
          {
            path: 'product-submissions',
            loadComponent: () =>
              import('./features/merchant-space/merchant-product-submissions/merchant-product-submissions.component').then(
                (m) => m.MerchantProductSubmissionsComponent,
              ),
            title: 'routes.merchantProductSubmissions.title',
          },
          {
            path: 'orders/:id',
            loadComponent: () =>
              import('./features/order-detail/order-detail.component').then(
                (m) => m.OrderDetailComponent,
              ),
            title: 'routes.orderDetail.title',
            data: { orderView: 'merchant' },
          },
        ],
      },
      {
        path: 'merchant-space',
        redirectTo: 'merchant',
        pathMatch: 'full',
      },
      {
        path: 'admin-space',
        canActivate: [roleGuard(['ADMIN'])],
        loadComponent: () =>
          import('./features/admin-space/admin-space.component').then(
            (m) => m.AdminSpaceComponent,
          ),
        title: 'routes.adminSpace.title',
        children: [
          {
            path: '',
            redirectTo: 'merchants',
            pathMatch: 'full',
          },
          {
            path: 'merchants',
            loadComponent: () =>
              import('./features/admin-space/admin-merchants/admin-merchants.component').then(
                (m) => m.AdminMerchantsComponent,
              ),
            title: 'routes.adminMerchants.title',
          },
          {
            path: 'merchants/invite',
            loadComponent: () =>
              import('./features/admin-space/admin-create-merchant/admin-create-merchant.component').then(
                (m) => m.AdminCreateMerchantComponent,
              ),
            title: 'routes.adminCreateMerchant.title',
          },
          {
            path: 'catalog',
            children: [
              {
                path: '',
                redirectTo: 'product',
                pathMatch: 'full',
              },
              {
                path: 'product',
                loadComponent: () =>
                  import('./features/admin-space/admin-products/admin-products.component').then(
                    (m) => m.AdminProductsComponent,
                  ),
                title: 'routes.adminProducts.title',
              },
              {
                path: 'categories',
                loadComponent: () =>
                  import('./features/admin-space/admin-product-categories/admin-product-categories.component').then(
                    (m) => m.AdminProductCategoriesComponent,
                  ),
                title: 'routes.adminProductCategories.title',
              },
              {
                path: 'business-types',
                loadComponent: () =>
                  import('./features/admin-space/admin-business-types/admin-business-types.component').then(
                    (m) => m.AdminBusinessTypesComponent,
                  ),
                title: 'routes.adminBusinessTypes.title',
              },
            ],
          },
          {
            path: 'product-submissions',
            loadComponent: () =>
              import('./features/admin-space/admin-product-submissions/admin-product-submissions.component').then(
                (m) => m.AdminProductSubmissionsComponent,
              ),
            title: 'routes.adminProductSubmissions.title',
          },
        ],
      },
    ],
  },
  {
    path: 'merchant-onboarding',
    canActivate: [authGuard, roleGuard(['MERCHANT']), merchantOnboardingGuard],
    loadComponent: () =>
      import('./features/merchant-space/merchant-onboarding/merchant-onboarding.component').then(
        (m) => m.MerchantOnboardingComponent,
      ),
    title: 'routes.merchantOnboarding.title',
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
    path: 'shop/:merchantSlug',
    loadComponent: () =>
      import('./layouts/app-shell/app-shell.component').then(
        (m) => m.AppShellComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shop/merchant-shop/merchant-shop.component').then(
            (m) => m.MerchantShopComponent,
          ),
        title: 'routes.merchantShop.title',
      },
    ],
  },
  {
    path: 'shop/:merchantSlug/categories',
    loadComponent: () =>
      import('./layouts/app-shell/app-shell.component').then(
        (m) => m.AppShellComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/shop/shop-categories/shop-categories.component').then(
            (m) => m.ShopCategoriesComponent,
          ),
        title: 'routes.shopCategories.title',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
