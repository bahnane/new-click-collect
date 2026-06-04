import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);
  readonly errorMessageKey = signal<string | null>(null);
  readonly successMessageKey = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  onSubmit(): void {
    if (this.form.invalid || this.isLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.form.disable();
    this.errorMessageKey.set(null);
    this.successMessageKey.set(null);
    this.isLoading.set(true);

    this.authService.forgotPassword(this.form.getRawValue()).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.form.enable();
        this.form.reset();
        this.successMessageKey.set('auth.forgotPassword.successMessage');
      },
      error: (error) => {
        this.isLoading.set(false);
        this.form.enable();
        this.errorMessageKey.set(
          this.resolveForgotPasswordErrorMessageKey(error),
        );
      },
    });
  }

  private resolveForgotPasswordErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return (
        AUTH_ERROR_I18N_KEY_BY_CODE[code] ??
        'auth.forgotPassword.errors.generic'
      );
    }

    if (error instanceof HttpErrorResponse && error.status === 400) {
      return 'auth.apiErrors.VALIDATION_ERROR';
    }

    return 'auth.forgotPassword.errors.generic';
  }
}
