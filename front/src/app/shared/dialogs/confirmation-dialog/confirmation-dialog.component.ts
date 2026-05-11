import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';

export interface ConfirmationDialogData {
  title: string;
  message: string;
  itemName?: string;
  confirmLabel?: string;
  confirmColor?: 'primary' | 'accent' | 'warn';
  icon?: string;
  confirmAction?: () => Observable<unknown>;
}

@Component({
  selector: 'app-confirmation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './confirmation-dialog.component.html',
  styleUrl: './confirmation-dialog.component.scss',
})
export class ConfirmationDialogComponent {
  confirming = false;
  apiErrorKey: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<ConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmationDialogData,
    private readonly translocoService: TranslocoService,
  ) {}

  getTranslatedMessage(): string {
    const translated = this.translocoService.translate(this.data.message);
    if (!this.data.itemName) {
      return translated;
    }

    const safeItemName = this.escapeHtml(this.data.itemName);
    const highlightedItemName = `<strong>${safeItemName}</strong>`;

    return translated
      .replaceAll('{{itemName}}', highlightedItemName)
      .replaceAll('{itemName}', highlightedItemName);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    if (this.confirming) {
      return;
    }

    if (!this.data.confirmAction) {
      this.dialogRef.close(true);
      return;
    }

    this.confirming = true;
    this.apiErrorKey = null;

    this.data.confirmAction().subscribe({
      next: () => {
        this.confirming = false;
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.confirming = false;
        this.apiErrorKey = this.mapApiError(error);
      },
    });
  }

  private mapApiError(error: unknown): string {
    const errorCode = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
    return (
      AUTH_ERROR_I18N_KEY_BY_CODE[errorCode] ||
      'auth.apiErrors.INTERNAL_SERVER_ERROR'
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
