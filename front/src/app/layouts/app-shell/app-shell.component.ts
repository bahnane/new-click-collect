import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { UiFeedbackService } from '../../core/services/ui-feedback.service';
import { getDefaultAuthenticatedRoute } from '../../core/utils/default-auth-route.util';

interface ShellTab {
  labelKey: string;
  icon: string;
  route: string[];
  exact?: boolean;
}

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
  protected readonly languageService = inject(LanguageService);

  readonly currentUser = this.authService.currentUser;

  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly isMerchant = computed(() => this.currentUser()?.role === 'MERCHANT');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');
  readonly homeRoute = computed(() =>
    getDefaultAuthenticatedRoute(this.currentUser()),
  );
  readonly globalErrorKey = this.uiFeedback.errorKey;

  readonly primaryTabs = computed<ShellTab[]>(() => {
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
