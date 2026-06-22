import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AuthService } from '../../../core/services/auth.service';
import { ConfirmationDialogComponent } from '../../../shared/dialogs/confirmation-dialog/confirmation-dialog.component';

type AccountScope = 'customer' | 'merchant';
type SecurityAction = 'changePassword' | 'deleteAccount';

interface SecurityEntry {
  action: SecurityAction;
  labelKey: string;
  descriptionKey: string;
  icon: string;
  tone?: 'default' | 'danger';
}

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
  selector: 'app-account-security',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './account-security.component.html',
  styleUrl: './account-security.component.scss',
})
export class AccountSecurityComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly authService = inject(AuthService);

  readonly scope = computed<AccountScope>(
    () =>
      (this.route.snapshot.data['accountScope'] as AccountScope) ?? 'customer',
  );

  readonly titleKey = 'account.sections.security.title';
  readonly activeAction = signal<SecurityAction | null>(null);
  readonly changePasswordInFlight = signal(false);
  readonly changePasswordErrorKey = signal<string | null>(null);

  readonly changePasswordForm = this.fb.nonNullable.group(
    {
      currentPassword: ['', [Validators.required, Validators.minLength(8)]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: passwordMatchValidator,
    },
  );

  readonly entries = computed<SecurityEntry[]>(() => [
    {
      action: 'changePassword',
      labelKey: 'account.security.changePassword.title',
      descriptionKey: 'account.security.changePassword.description',
      icon: 'password',
    },
    {
      action: 'deleteAccount',
      labelKey: 'account.security.deleteAccount.title',
      descriptionKey: 'account.security.deleteAccount.description',
      icon: 'delete_forever',
      tone: 'danger',
    },
  ]);

  onAction(entry: SecurityEntry): void {
    if (entry.action === 'changePassword') {
      this.toggleChangePasswordForm();
      return;
    }

    this.openDeleteAccountDialog();
  }

  submitChangePassword(): void {
    if (this.changePasswordInFlight()) {
      return;
    }

    if (this.changePasswordForm.invalid) {
      this.changePasswordForm.markAllAsTouched();
      return;
    }

    this.changePasswordErrorKey.set(null);
    this.changePasswordInFlight.set(true);

    this.authService
      .changePassword({
        currentPassword: this.changePasswordForm.controls.currentPassword.value,
        newPassword: this.changePasswordForm.controls.newPassword.value,
      })
      .subscribe({
        next: () => {
          this.changePasswordInFlight.set(false);
          this.authService.logout().subscribe();
        },
        error: (error: unknown) => {
          const code = extractApiErrorCode(error);
          this.changePasswordInFlight.set(false);
          this.changePasswordErrorKey.set(
            code
              ? (AUTH_ERROR_I18N_KEY_BY_CODE[code] ??
                  'account.security.changePassword.errors.generic')
              : 'account.security.changePassword.errors.generic',
          );
        },
      });
  }

  closeChangePasswordForm(): void {
    if (this.changePasswordInFlight()) {
      return;
    }

    this.activeAction.set(null);
    this.changePasswordErrorKey.set(null);
    this.changePasswordForm.reset();
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

  private toggleChangePasswordForm(): void {
    const isOpen = this.activeAction() === 'changePassword';
    if (isOpen) {
      this.closeChangePasswordForm();
      return;
    }

    this.activeAction.set('changePassword');
    this.changePasswordErrorKey.set(null);
  }

  private openDeleteAccountDialog(): void {
    this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'account.security.deleteAccount.confirmTitle',
        message: 'account.security.deleteAccount.confirmMessage',
        confirmLabel: 'account.security.deleteAccount.confirmCta',
        confirmColor: 'warn',
        icon: 'warning',
        confirmAction: () => this.authService.deleteMyAccount(),
      },
    });
  }
}
