import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AuthService } from '../../../core/services/auth.service';

type VerificationState = 'loading' | 'success' | 'error';

@Component({
  selector: 'app-verify-email',
  imports: [
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss',
})
export class VerifyEmailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);

  readonly state = signal<VerificationState>('loading');
  readonly messageKey = signal<string>('auth.verifyEmail.loading');

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';

    if (!token) {
      this.state.set('error');
      this.messageKey.set('auth.verifyEmail.errors.tokenMissing');
      return;
    }

    this.authService.verifyEmail({ token }).subscribe({
      next: () => {
        this.state.set('success');
        this.messageKey.set('auth.verifyEmail.successMessage');
      },
      error: (error) => {
        this.state.set('error');
        this.messageKey.set(this.resolveVerifyEmailErrorMessageKey(error));
      },
    });
  }

  private resolveVerifyEmailErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return (
        AUTH_ERROR_I18N_KEY_BY_CODE[code] ?? 'auth.verifyEmail.errors.generic'
      );
    }

    return 'auth.verifyEmail.errors.generic';
  }
}
