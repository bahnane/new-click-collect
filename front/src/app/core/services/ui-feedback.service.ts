import { inject, Injectable, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  readonly errorKey = signal<string | null>(null);

  showError(errorKey: string): void {
    this.errorKey.set(errorKey);
  }

  clearError(): void {
    this.errorKey.set(null);
  }

  showSuccessToast(messageKey: string): void {
    this.snackBar.open(
      this.transloco.translate(messageKey),
      this.transloco.translate('common.close'),
      {
        duration: 4500,
        horizontalPosition: 'end',
        verticalPosition: 'top',
        panelClass: 'app-success-snackbar',
      },
    );
  }
}
