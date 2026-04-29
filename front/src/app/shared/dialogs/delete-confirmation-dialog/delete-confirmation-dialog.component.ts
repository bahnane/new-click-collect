import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

export interface DeleteConfirmationDialogData {
  title: string;
  message: string;
  itemName?: string;
}

@Component({
  selector: 'app-delete-confirmation-dialog',
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title | transloco }}</h2>
    <mat-dialog-content>
      <div class="dialog-content">
        <mat-icon class="warning-icon">warning</mat-icon>
        <div class="message">
          <p [innerHTML]="getFormattedMessage()"></p>
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-raised-button color="warn" (click)="onConfirm()">
        {{ 'common.delete' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-content {
      display: flex;
      gap: 1rem;
      align-items: flex-start;
      margin: 1rem 0;
    }

    .warning-icon {
      color: #f57c00;
      flex-shrink: 0;
      margin-top: 0.25rem;
    }

    .message {
      flex: 1;

      p {
        margin: 0;
        font-size: 0.9rem;
      }
    }

    mat-dialog-actions {
      gap: 0.5rem;
      padding: 1rem 0 0;
    }
  `,
})
export class DeleteConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<DeleteConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeleteConfirmationDialogData,
  ) {}

  getFormattedMessage(): string {
    const baseMessage = this.data.message;
    if (this.data.itemName) {
      return baseMessage.replace(
        '{itemName}',
        `<strong>${this.data.itemName}</strong>`,
      );
    }
    return baseMessage;
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }
}
