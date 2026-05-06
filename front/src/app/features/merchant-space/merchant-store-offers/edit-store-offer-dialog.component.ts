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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { StoreOffer } from '../../../core/models/merchant-shop.model';
import { UpdateStoreOfferPayload } from '../../../core/services/merchants.service';

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
      </form>

      @if (validationErrorKey) {
        <div class="error-banner" role="alert" aria-live="polite">
          <mat-icon aria-hidden="true">error_outline</mat-icon>
          <span>{{ validationErrorKey | transloco }}</span>
        </div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="onCancel()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        (click)="onConfirm()"
      >
        {{ 'common.save' | transloco }}
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
        gap: 0.25rem;
      }

      .field {
        width: 100%;
      }

      .price-field {
        margin-block-end: 0.5rem;
      }

      .error-banner {
        margin-block-start: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--app-color-danger-700, #b42318);
      }
    `,
  ],
})
export class EditStoreOfferDialogComponent {
  readonly priceControl: FormControl<string>;
  readonly minOrderQtyControl: FormControl<string>;
  readonly stepQtyControl: FormControl<string>;

  validationErrorKey: string | null = null;

  constructor(
    public dialogRef: MatDialogRef<
      EditStoreOfferDialogComponent,
      UpdateStoreOfferPayload | undefined
    >,
    @Inject(MAT_DIALOG_DATA) public data: EditStoreOfferDialogData,
  ) {
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
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    this.onConfirm();
  }

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onConfirm(): void {
    const minOrderQty = this.parsePositiveDecimal(
      this.minOrderQtyControl.value,
    );
    const stepQty = this.parsePositiveDecimal(this.stepQtyControl.value);
    const priceInCents = this.parsePriceToCents(this.priceControl.value);

    if (minOrderQty == null || stepQty == null || priceInCents === undefined) {
      this.validationErrorKey =
        'shell.merchant.storeOffers.create.validation.invalidValues';
      return;
    }

    this.dialogRef.close({
      minOrderQty,
      stepQty,
      priceInCents,
    });
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
