import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { AuthService } from '../../core/services/auth.service';
import { getDefaultAuthenticatedRoute } from '../../core/utils/default-auth-route.util';
import { resolvePostAuthMerchantSlug } from '../../core/utils/post-auth-redirect.util';

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
  protected readonly languageService = inject(LanguageService);

  readonly isMenuOpen = signal(false);
  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = this.authService.isAuthenticated;

  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly isMerchant = computed(() => this.currentUser()?.role === 'MERCHANT');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');
  readonly homeRoute = computed(() =>
    getDefaultAuthenticatedRoute(this.currentUser()),
  );
  readonly showDashboardLink = computed(
    () => this.currentUser()?.role !== 'MERCHANT',
  );
  readonly merchantShopSlug = resolvePostAuthMerchantSlug();

  toggleMenu(): void {
    this.isMenuOpen.update((value) => !value);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  logout(): void {
    this.authService.logout().subscribe();
    this.closeMenu();
  }

  setLanguage(language: 'fr' | 'ar'): void {
    this.authService.updatePreferredLanguage(language).subscribe();
  }
}
