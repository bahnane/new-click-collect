import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const newPassword = control.get('newPassword')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!newPassword || !confirmPassword) {
    return null;
  }

  return newPassword === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-reset-password',
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
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly uiFeedback = inject(UiFeedbackService);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly token = computed(
    () => this.queryParamMap().get('token')?.trim() ?? '',
  );
  readonly isLoading = signal(false);
  readonly errorMessageKey = signal<string | null>(null);
  readonly successMessageKey = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: passwordMatchValidator,
    },
  );

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.update((value) => !value);
  }

  onSubmit(): void {
    if (!this.token()) {
      this.errorMessageKey.set('auth.resetPassword.errors.tokenMissing');
      return;
    }

    if (this.form.invalid || this.isLoading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.form.disable();
    this.errorMessageKey.set(null);
    this.successMessageKey.set(null);
    this.isLoading.set(true);

    this.authService
      .resetPassword({
        token: this.token(),
        newPassword: this.form.controls.newPassword.value,
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.form.enable();
          this.form.reset();
          this.successMessageKey.set('auth.resetPassword.successMessage');
          this.uiFeedback.showSuccessToast('auth.resetPassword.successMessage');
        },
        error: (error) => {
          this.isLoading.set(false);
          this.form.enable();
          this.errorMessageKey.set(
            this.resolveResetPasswordErrorMessageKey(error),
          );
        },
      });
  }

  private resolveResetPasswordErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return (
        AUTH_ERROR_I18N_KEY_BY_CODE[code] ?? 'auth.resetPassword.errors.generic'
      );
    }

    if (error instanceof HttpErrorResponse && error.status === 400) {
      return 'auth.apiErrors.AUTH_RESET_TOKEN_INVALID_OR_EXPIRED';
    }

    return 'auth.resetPassword.errors.generic';
  }
}
