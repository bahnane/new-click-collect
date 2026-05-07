import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { SimilarCatalogProduct } from '../../../core/services/merchants.service';
import { Product } from '../../../core/models/merchant-shop.model';

export interface CreateOfferFromSuggestionDialogData {
  product: SimilarCatalogProduct;
}

export interface CreateOfferFromSuggestionDialogResult {
  priceInCents?: number;
  minOrderQty: number;
  stepQty: number;
}

@Component({
  selector: 'app-create-offer-from-suggestion-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslocoPipe,
  ],
  templateUrl: './create-offer-from-suggestion-dialog.component.html',
  styleUrl: './create-offer-from-suggestion-dialog.component.scss',
})
export class CreateOfferFromSuggestionDialogComponent {
  readonly form = new FormGroup({
    price: new FormControl('', { nonNullable: true }),
    minOrderQty: new FormControl('1', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d+(\.\d+)?$/),
        Validators.min(0.001),
      ],
    }),
    stepQty: new FormControl('1', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^\d+(\.\d+)?$/),
        Validators.min(0.001),
      ],
    }),
  });

  constructor(
    public dialogRef: MatDialogRef<CreateOfferFromSuggestionDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: CreateOfferFromSuggestionDialogData,
  ) {
    // Pre-fill price if available
    if (data.product.priceInCents != null) {
      this.form.controls.price.setValue(
        (data.product.priceInCents / 100).toFixed(2),
      );
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const priceInCents = this.parsePriceToCents(this.form.controls.price.value);
    const minOrderQty = Number.parseFloat(this.form.controls.minOrderQty.value);
    const stepQty = Number.parseFloat(this.form.controls.stepQty.value);

    const result: CreateOfferFromSuggestionDialogResult = {
      minOrderQty,
      stepQty,
      ...(priceInCents !== undefined ? { priceInCents } : {}),
    };

    this.dialogRef.close(result);
  }

  getSaleUnitLabel(saleUnit: Product['saleUnit']): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  private parsePriceToCents(value: string): number | undefined {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }

    return Math.round(parsed * 100);
  }
}
