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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { getDefaultAuthenticatedRoute } from '../../../core/utils/default-auth-route.util';

const passwordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;

  if (!password || !confirmPassword) {
    return null;
  }

  return password === confirmPassword ? null : { passwordMismatch: true };
};

@Component({
  selector: 'app-activate-invite',
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
  templateUrl: './activate-invite.component.html',
  styleUrl: './activate-invite.component.scss',
})
export class ActivateInviteComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

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
      password: ['', [Validators.required, Validators.minLength(8)]],
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
      this.errorMessageKey.set('auth.activateInvite.errors.tokenMissing');
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
      .activateInvite({
        token: this.token(),
        password: this.form.controls.password.value,
      })
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          this.successMessageKey.set('auth.activateInvite.successMessage');
          const merchantSlug = this.route.snapshot.queryParamMap
            .get('merchantSlug')
            ?.trim();
          if (merchantSlug) {
            this.router.navigate(['/shop', merchantSlug]);
            return;
          }

          this.router.navigate(getDefaultAuthenticatedRoute(response.user));
        },
        error: (error) => {
          this.isLoading.set(false);
          this.form.enable();
          this.errorMessageKey.set(
            this.resolveActivateInviteErrorMessageKey(error),
          );
        },
      });
  }

  private resolveActivateInviteErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return (
        AUTH_ERROR_I18N_KEY_BY_CODE[code] ??
        'auth.activateInvite.errors.generic'
      );
    }

    if (error instanceof HttpErrorResponse && error.status === 400) {
      return 'auth.apiErrors.AUTH_INVITE_TOKEN_INVALID_OR_EXPIRED';
    }

    return 'auth.activateInvite.errors.generic';
  }
}
