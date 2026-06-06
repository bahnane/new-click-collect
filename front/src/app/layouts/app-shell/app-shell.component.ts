import { Component, computed, inject } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { UiFeedbackService } from '../../core/services/ui-feedback.service';
import { getDefaultAuthenticatedRoute } from '../../core/utils/default-auth-route.util';

interface ShellTab {
  labelKey: string;
  icon: string;
  route: string[];
  exact?: boolean;
  queryParams?: Record<string, string>;
}

type ShellContext = 'customer' | 'merchant' | 'admin' | 'shop';

@Component({
  selector: 'app-app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly uiFeedback = inject(UiFeedbackService);
  private readonly router = inject(Router);
  protected readonly languageService = inject(LanguageService);

  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  readonly currentPath = computed(() => this.currentUrl().split('?')[0]);
  readonly currentQueryParams = computed(() => {
    const queryString = this.currentUrl().split('?')[1] ?? '';
    return new URLSearchParams(queryString.split('#')[0]);
  });

  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly isMerchant = computed(() => this.currentUser()?.role === 'MERCHANT');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');
  readonly homeRoute = computed(() =>
    getDefaultAuthenticatedRoute(this.currentUser()),
  );
  readonly globalErrorKey = this.uiFeedback.errorKey;

  readonly merchantShopSlug = computed(() => {
    const pathMatch = this.currentPath().match(/^\/shop\/([^/?#]+)/);
    if (pathMatch?.[1]) {
      return pathMatch[1];
    }

    const queryMerchantSlug =
      this.currentQueryParams().get('merchantSlug')?.trim() || null;
    if (!queryMerchantSlug) {
      return null;
    }

    const currentPath = this.currentPath();
    if (
      currentPath === '/cart' ||
      currentPath === '/dashboard/orders' ||
      currentPath.startsWith('/order-confirmation') ||
      currentPath.startsWith('/detail-commande')
    ) {
      return queryMerchantSlug;
    }

    return null;
  });

  readonly shellContext = computed<ShellContext>(() => {
    if (this.merchantShopSlug()) {
      return 'shop';
    }

    if (this.isMerchant()) {
      return 'merchant';
    }

    if (this.isAdmin()) {
      return 'admin';
    }

    return 'customer';
  });

  readonly primaryTabs = computed<ShellTab[]>(() => {
    if (this.shellContext() === 'shop') {
      const merchantSlug = this.merchantShopSlug();
      if (!merchantSlug) {
        return [];
      }

      return [
        {
          labelKey: 'shell.nav.shopHome',
          icon: 'storefront',
          route: ['/shop', merchantSlug],
          exact: true,
        },
        {
          labelKey: 'shell.nav.categories',
          icon: 'category',
          route: ['/shop', merchantSlug, 'categories'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.cart',
          icon: 'shopping_cart',
          route: ['/cart'],
          exact: true,
          queryParams: { merchantSlug },
        },
        {
          labelKey: 'shell.nav.orders',
          icon: 'receipt_long',
          route: ['/dashboard', 'orders'],
          exact: true,
          queryParams: { merchantSlug },
        },
      ];
    }

    if (this.isCustomer()) {
      return [
        {
          labelKey: 'shell.nav.home',
          icon: 'home',
          route: ['/dashboard'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.orders',
          icon: 'receipt_long',
          route: ['/dashboard', 'orders'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.cart',
          icon: 'shopping_cart',
          route: ['/cart'],
          exact: true,
        },
      ];
    }

    if (this.isMerchant()) {
      return [
        {
          labelKey: 'shell.nav.overview',
          icon: 'dashboard',
          route: ['/merchant', 'overview'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.offers',
          icon: 'sell',
          route: ['/merchant', 'store-offers'],
        },
        {
          labelKey: 'shell.nav.submissions',
          icon: 'inventory_2',
          route: ['/merchant', 'product-submissions'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.profile',
          icon: 'person',
          route: ['/merchant', 'profile'],
          exact: true,
        },
      ];
    }

    if (this.isAdmin()) {
      return [
        {
          labelKey: 'shell.nav.merchants',
          icon: 'store',
          route: ['/admin-space', 'merchants'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.products',
          icon: 'inventory',
          route: ['/admin-space', 'products'],
          exact: true,
        },
        {
          labelKey: 'shell.nav.productSubmissions',
          icon: 'fact_check',
          route: ['/admin-space', 'product-submissions'],
          exact: true,
        },
      ];
    }

    return [];
  });

  logout(): void {
    this.authService.logout().subscribe();
  }

  setLanguage(language: 'fr' | 'ar'): void {
    this.authService.updatePreferredLanguage(language).subscribe();
  }

  clearGlobalError(): void {
    this.uiFeedback.clearError();
  }
}
