import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe } from '@jsverse/transloco';
import { Product } from '../../../../core/models/merchant-shop.model';
import {
  AdminCatalogProduct,
  AdminProductCategory,
} from '../../../../core/services/merchants.service';

export interface AdminProductEditorDialogData {
  product?: AdminCatalogProduct;
  categories: AdminProductCategory[];
  isEditMode: boolean;
}

export interface AdminProductEditorPayload {
  name: string;
  categoryId: string;
  saleUnit: Product['saleUnit'];
  description?: string;
  priceInCents: number | null | undefined;
}

@Component({
  selector: 'app-admin-product-editor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    TranslocoPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        isEditMode
          ? ('shell.adminSpace.products.editor.editTitle' | transloco)
          : ('shell.adminSpace.products.editor.createTitle' | transloco)
      }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="editor-form">
        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.adminSpace.products.fields.name' | transloco
          }}</mat-label>
          <input matInput type="text" formControlName="name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.adminSpace.products.fields.category' | transloco
          }}</mat-label>
          <mat-select formControlName="categoryId">
            @for (category of data.categories; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.adminSpace.products.fields.saleUnit' | transloco
          }}</mat-label>
          <mat-select formControlName="saleUnit">
            <mat-option value="KG">{{
              'shop.saleUnit.kg' | transloco
            }}</mat-option>
            <mat-option value="G">{{
              'shop.saleUnit.g' | transloco
            }}</mat-option>
            <mat-option value="LITER">{{
              'shop.saleUnit.liter' | transloco
            }}</mat-option>
            <mat-option value="UNIT">{{
              'shop.saleUnit.unit' | transloco
            }}</mat-option>
            <mat-option value="PORTION">{{
              'shop.saleUnit.portion' | transloco
            }}</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.adminSpace.products.fields.price' | transloco
          }}</mat-label>
          <input
            matInput
            type="text"
            inputmode="decimal"
            formControlName="price"
          />
          <mat-hint>{{
            'shell.adminSpace.products.fields.priceHint' | transloco
          }}</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{
            'shell.adminSpace.products.fields.description' | transloco
          }}</mat-label>
          <textarea matInput rows="3" formControlName="description"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-stroked-button (click)="cancel()">
        {{ 'common.cancel' | transloco }}
      </button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="form.invalid || saving"
        (click)="submit()"
      >
        @if (saving) {
          <mat-spinner diameter="18"></mat-spinner>
        }
        {{
          isEditMode
            ? ('common.save' | transloco)
            : ('common.create' | transloco)
        }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .editor-form {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        margin-block: 1rem;
      }

      .editor-form .full-width {
        grid-column: 1 / -1;
      }

      @media (max-width: 699px) {
        .editor-form {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminProductEditorDialogComponent implements OnInit {
  isEditMode: boolean;
  saving = false;

  form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(191),
      ],
    }),
    categoryId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    saleUnit: new FormControl<Product['saleUnit']>('UNIT', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    price: new FormControl('', { nonNullable: true }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
  });

  constructor(
    public dialogRef: MatDialogRef<AdminProductEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: AdminProductEditorDialogData,
  ) {
    this.isEditMode = data.isEditMode;
  }

  ngOnInit(): void {
    if (this.isEditMode && this.data.product) {
      const p = this.data.product;
      this.form.patchValue({
        name: p.name,
        categoryId: p.category.id,
        saleUnit: p.saleUnit,
        price: p.priceInCents == null ? '' : (p.priceInCents / 100).toFixed(2),
        description: p.description ?? '',
      });
    } else if (this.data.categories.length > 0) {
      this.form.patchValue({
        categoryId: this.data.categories[0].id,
      });
    }
  }

  submit(): void {
    if (this.saving || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const priceInCents = this.parsePriceToCents(this.form.controls.price.value);
    if (priceInCents === null) {
      return;
    }

    const payload: AdminProductEditorPayload = {
      name: this.form.controls.name.value.trim(),
      categoryId: this.form.controls.categoryId.value,
      saleUnit: this.form.controls.saleUnit.value,
      description: this.form.controls.description.value.trim() || undefined,
      priceInCents,
    };

    this.dialogRef.close(payload);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private parsePriceToCents(value: string): number | undefined | null {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return Math.round(parsed * 100);
  }
}
