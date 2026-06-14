import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../core/services/auth.service';
import { LanguageService } from '../../../core/i18n/language.service';

type AccountScope = 'customer' | 'merchant';

@Component({
  selector: 'app-account-language',
  imports: [CommonModule, MatCardModule, MatIconModule, TranslocoPipe],
  templateUrl: './account-language.component.html',
  styleUrl: './account-language.component.scss',
})
export class AccountLanguageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  protected readonly languageService = inject(LanguageService);

  readonly scope = computed<AccountScope>(
    () =>
      (this.route.snapshot.data['accountScope'] as AccountScope) ?? 'customer',
  );
  readonly pendingLanguage = signal<'fr' | 'ar' | null>(null);

  setLanguage(language: 'fr' | 'ar'): void {
    if (this.pendingLanguage()) {
      return;
    }

    this.pendingLanguage.set(language);
    this.authService.updatePreferredLanguage(language).subscribe({
      next: () => this.pendingLanguage.set(null),
      error: () => this.pendingLanguage.set(null),
    });
  }

  goBack(): void {
    if (this.scope() === 'merchant') {
      this.router.navigate(['/merchant', 'account']);
      return;
    }

    const merchantSlug = this.route.snapshot.queryParamMap
      .get('merchantSlug')
      ?.trim();
    this.router.navigate(['/account'], {
      queryParams: merchantSlug ? { merchantSlug } : undefined,
    });
  }
}
