import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { StoreOffer } from '../../../core/models/merchant-shop.model';
import {
  MerchantsService,
  UpdateStoreOfferPayload,
} from '../../../core/services/merchants.service';

interface EditStoreOfferDialogData {
  offer: StoreOffer;
}

@Component({
  selector: 'app-edit-store-offer-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ 'shell.merchant.storeOffers.edit' | transloco }}
    </h2>

    <mat-dialog-content>
      <p class="product-name">{{ data.offer.product.name }}</p>

      <form class="edit-form" (submit)="onSubmit($event)">
        <mat-form-field appearance="outline" class="field price-field">
          <mat-label>
            {{ 'shell.merchant.storeOffers.create.fields.price' | transloco }}
          </mat-label>
          <input
            matInput
            type="text"
            [formControl]="priceControl"
            [placeholder]="
              'shell.merchant.storeOffers.create.fields.pricePlaceholder'
                | transloco
            "
          />
          <mat-hint>
            {{
              'shell.merchant.storeOffers.create.fields.priceHint' | transloco
            }}
          </mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="field">
          <mat-label>
            {{ 'shell.merchant.storeOffers.create.fields.minQty' | transloco }}
          </mat-label>
          <input matInput type="text" [formControl]="minOrderQtyControl" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="field">
          <mat-label>
            {{ 'shell.merchant.storeOffers.create.fields.stepQty' | transloco }}
          </mat-label>
          <input matInput type="text" [formControl]="stepQtyControl" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="field">
          <mat-label>
            {{ 'shell.merchant.storeOffers.create.fields.maxQty' | transloco }}
          </mat-label>
          <input matInput type="text" [formControl]="maxOrderQtyControl" />
          <mat-hint>
            {{
              'shell.merchant.storeOffers.create.fields.maxQtyHint' | transloco
            }}
          </mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      @if (apiErrorKey || validationErrorKey; as currentErrorKey) {
        <div class="error-row" role="alert" aria-live="polite">
          <mat-icon aria-hidden="true">error_outline</mat-icon>
          <span>{{ currentErrorKey | transloco }}</span>
        </div>
      }
      <button mat-button type="button" (click)="onCancel()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        [disabled]="saving"
        (click)="onConfirm()"
      >
        @if (saving) {
          <mat-spinner diameter="18"></mat-spinner>
        } @else {
          {{ 'common.save' | transloco }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .product-name {
        margin: 0 0 0.75rem;
        font-weight: 600;
      }

      .edit-form {
        display: grid;
        gap: 0.75rem;
      }

      .field {
        width: 100%;
      }

      .price-field {
        margin-block-end: 0.75rem;
      }

      mat-dialog-actions {
        position: sticky;
        inset-block-end: 0;
        z-index: 1;
        flex-wrap: wrap;
        justify-content: flex-end;
        padding-block-start: 0.75rem;
        background-color: var(--color-bg-secondary);
        border-block-start: 1px solid
          color-mix(in srgb, var(--color-divider) 70%, transparent);
      }

      .error-row {
        flex: 1 0 100%;
        margin-block-end: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--color-error);
      }
    `,
  ],
})
export class EditStoreOfferDialogComponent {
  private readonly merchantsService: MerchantsService;

  readonly priceControl: FormControl<string>;
  readonly minOrderQtyControl: FormControl<string>;
  readonly stepQtyControl: FormControl<string>;
  readonly maxOrderQtyControl: FormControl<string>;

  saving = false;
  validationErrorKey: string | null = null;
  apiErrorKey: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<
      EditStoreOfferDialogComponent,
      boolean | undefined
    >,
    @Inject(MAT_DIALOG_DATA) public data: EditStoreOfferDialogData,
    merchantsService: MerchantsService,
  ) {
    this.merchantsService = merchantsService;
    this.priceControl = new FormControl<string>(
      this.data.offer.overridePriceInCents == null
        ? ''
        : (this.data.offer.overridePriceInCents / 100).toFixed(2),
      { nonNullable: true },
    );
    this.minOrderQtyControl = new FormControl<string>(
      this.data.offer.minOrderQty.toString(),
      {
        nonNullable: true,
      },
    );
    this.stepQtyControl = new FormControl<string>(
      this.data.offer.stepQty.toString(),
      {
        nonNullable: true,
      },
    );
    this.maxOrderQtyControl = new FormControl<string>(
      this.data.offer.maxOrderQty?.toString() ?? '',
      { nonNullable: true },
    );
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.onConfirm();
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onConfirm(): void {
    if (this.saving) {
      return;
    }

    const minOrderQty = this.parsePositiveDecimal(
      this.minOrderQtyControl.value,
    );
    const stepQty = this.parsePositiveDecimal(this.stepQtyControl.value);
    const maxOrderQty = this.maxOrderQtyControl.value.trim()
      ? this.parsePositiveDecimal(this.maxOrderQtyControl.value)
      : null;
    const priceInCents = this.parsePriceToCents(this.priceControl.value);

    if (minOrderQty == null || stepQty == null || priceInCents === undefined) {
      this.validationErrorKey =
        'shell.merchant.storeOffers.create.validation.invalidValues';
      return;
    }

    this.validationErrorKey = null;
    this.apiErrorKey = null;
    this.saving = true;

    const payload: UpdateStoreOfferPayload = {
      minOrderQty,
      stepQty,
      priceInCents,
      maxOrderQty,
    };

    this.merchantsService.updateOffer(this.data.offer.id, payload).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving = false;
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

  private parsePositiveDecimal(value: string): number | null {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private parsePriceToCents(value: string): number | null | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }

    return Math.round(parsed * 100);
  }
}
