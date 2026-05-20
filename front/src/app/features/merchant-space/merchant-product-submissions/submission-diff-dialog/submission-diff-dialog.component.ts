import { Component, Inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Product } from '../../../../core/models/merchant-shop.model';

export interface SubmissionDiffDialogData {
  name: string;
  description: string | null;
  saleUnit: Product['saleUnit'];
  priceInCents: number | null;
  category: { id: string; name: string };
  subCategory: { id: string; name: string } | null;
  approvedProduct: {
    name: string;
    description: string | null;
    saleUnit: Product['saleUnit'];
    priceInCents: number | null;
    category: { id: string; name: string };
    subCategory: { id: string; name: string } | null;
  };
}

interface DiffRow {
  labelKey: string;
  submitted: string;
  approved: string;
  changed: boolean;
}

@Component({
  selector: 'app-submission-diff-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'shell.merchant.productSubmissions.diff.title' | transloco }}
    </h2>

    <mat-dialog-content>
      <p class="diff-subtitle">
        {{ 'shell.merchant.productSubmissions.diff.subtitle' | transloco }}
      </p>

      <div
        class="diff-table"
        role="table"
        [attr.aria-label]="
          'shell.merchant.productSubmissions.diff.title' | transloco
        "
      >
        <div class="diff-row diff-header" role="row">
          <div class="diff-cell diff-field" role="columnheader"></div>
          <div class="diff-cell" role="columnheader">
            {{ 'shell.merchant.productSubmissions.diff.submitted' | transloco }}
          </div>
          <div class="diff-cell" role="columnheader">
            {{ 'shell.merchant.productSubmissions.diff.approved' | transloco }}
          </div>
        </div>

        @for (row of rows(); track row.labelKey) {
          <div class="diff-row" [class.diff-changed]="row.changed" role="row">
            <div class="diff-cell diff-field" role="cell">
              {{ row.labelKey | transloco }}
            </div>
            <div class="diff-cell diff-submitted" role="cell">
              {{ row.submitted }}
            </div>
            <div class="diff-cell diff-approved" role="cell">
              @if (row.changed) {
                <mat-icon aria-hidden="true" class="diff-arrow"
                  >arrow_forward</mat-icon
                >
              }
              {{ row.approved }}
            </div>
          </div>
        }
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button (click)="close()">
        {{ 'common.close' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .diff-subtitle {
        color: var(--mat-sys-on-surface-variant);
        margin-block-end: 1rem;
        font: var(--mat-sys-body-medium);
      }

      .diff-table {
        display: grid;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 0.5rem;
        overflow: hidden;
      }

      .diff-row {
        display: grid;
        grid-template-columns: minmax(6rem, 1fr) 2fr 2fr;
        gap: 0;
      }

      .diff-header {
        background: var(--mat-sys-surface-container);
        font-weight: 600;
        font: var(--mat-sys-label-medium);
      }

      .diff-cell {
        padding: 0.625rem 0.75rem;
        border-block-end: 1px solid var(--mat-sys-outline-variant);
        border-inline-end: 1px solid var(--mat-sys-outline-variant);
        font: var(--mat-sys-body-medium);
        overflow-wrap: break-word;
        min-width: 0;
      }

      .diff-row:last-child .diff-cell {
        border-block-end: none;
      }

      .diff-cell:last-child {
        border-inline-end: none;
      }

      .diff-field {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-label-small);
      }

      .diff-changed .diff-submitted {
        text-decoration: line-through;
        color: var(--mat-sys-on-surface-variant);
      }

      .diff-changed .diff-approved {
        color: #176b2c;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .diff-arrow {
        font-size: 1rem;
        inline-size: 1rem;
        block-size: 1rem;
        line-height: 1;
        flex-shrink: 0;
      }

      .diff-changed {
        background: color-mix(in srgb, #176b2c 6%, transparent);
      }
    `,
  ],
})
export class SubmissionDiffDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<SubmissionDiffDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SubmissionDiffDialogData,
  ) {}

  readonly rows = computed<DiffRow[]>(() => {
    const s = this.data;
    const p = s.approvedProduct;
    if (!p) return [];

    return [
      {
        labelKey: 'shell.merchant.productSubmissions.fields.name',
        submitted: s.name,
        approved: p.name,
        changed: p.name !== s.name,
      },
      {
        labelKey: 'shell.merchant.productSubmissions.fields.category',
        submitted: s.category.name,
        approved: p.category.name,
        changed: p.category.id !== s.category.id,
      },
      {
        labelKey: 'shell.merchant.productSubmissions.fields.subCategory',
        submitted: s.subCategory?.name || '—',
        approved: p.subCategory?.name || '—',
        changed: (p.subCategory?.id ?? null) !== (s.subCategory?.id ?? null),
      },
      {
        labelKey: 'shell.merchant.productSubmissions.fields.saleUnit',
        submitted: this.saleUnitLabel(s.saleUnit),
        approved: this.saleUnitLabel(p.saleUnit),
        changed: p.saleUnit !== s.saleUnit,
      },
      {
        labelKey: 'shell.merchant.productSubmissions.fields.price',
        submitted: this.formatPrice(s.priceInCents),
        approved: this.formatPrice(p.priceInCents),
        changed: p.priceInCents !== s.priceInCents,
      },
      {
        labelKey: 'shell.merchant.productSubmissions.fields.description',
        submitted: s.description || '—',
        approved: p.description || '—',
        changed: p.description !== s.description,
      },
    ];
  });

  close(): void {
    this.dialogRef.close();
  }

  private saleUnitLabel(unit: Product['saleUnit']): string {
    const labels: Record<Product['saleUnit'], string> = {
      KG: 'kg',
      G: 'g',
      LITER: 'L',
      UNIT: 'Unité',
      PORTION: 'Portion',
    };
    return labels[unit] ?? unit;
  }

  private formatPrice(cents: number | null): string {
    if (cents == null) return '—';
    return (cents / 100).toFixed(2);
  }
}
