import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { HttpErrorResponse } from '@angular/common/http';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { LanguageService } from '../../../core/i18n/language.service';
import { AuthService } from '../../../core/services/auth.service';
import { getDefaultAuthenticatedRoute } from '../../../core/utils/default-auth-route.util';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  protected readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly errorMessageKey = signal<string | null>(null);
  readonly showPassword = signal(false);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  onSubmit(): void {
    if (this.form.invalid || this.isLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.form.disable();
    this.errorMessageKey.set(null);
    this.isLoading.set(true);

    this.authService.login(this.form.getRawValue()).subscribe({
      next: (response) => {
        this.isLoading.set(false);

        // Admins always go to their dedicated space — never to a merchant shop.
        if (response.user.role === 'ADMIN') {
          this.router.navigate(getDefaultAuthenticatedRoute(response.user));
          return;
        }

        const merchantSlug = this.route.snapshot.queryParamMap
          .get('merchantSlug')
          ?.trim();
        if (merchantSlug) {
          this.router.navigate(['/shop', merchantSlug]);
          return;
        }

        this.router.navigate(getDefaultAuthenticatedRoute(response.user));
      },
      error: (err) => {
        this.isLoading.set(false);
        this.form.enable();
        this.errorMessageKey.set(this.resolveLoginErrorMessageKey(err));
      },
    });
  }

  setLanguage(language: 'fr' | 'ar'): void {
    this.languageService.setLanguage(language);
  }

  private resolveLoginErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return AUTH_ERROR_I18N_KEY_BY_CODE[code] ?? 'auth.login.errors.generic';
    }

    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'auth.apiErrors.AUTH_INVALID_CREDENTIALS';
    }

    return 'auth.login.errors.generic';
  }
}
