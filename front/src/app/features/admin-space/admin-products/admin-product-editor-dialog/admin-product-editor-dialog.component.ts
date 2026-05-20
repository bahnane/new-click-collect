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
import { extractApiErrorCode } from '../../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../../core/errors/auth-error-i18n-map';
import { Product } from '../../../../core/models/merchant-shop.model';
import {
  AdminCatalogProduct,
  AdminProductCategory,
  CreateAdminCatalogProductPayload,
  MerchantsService,
  UpdateAdminCatalogProductPayload,
} from '../../../../core/services/merchants.service';

export interface AdminProductEditorDialogData {
  product?: AdminCatalogProduct;
  categories: AdminProductCategory[];
  isEditMode: boolean;
}

export interface AdminProductEditorPayload {
  name: string;
  categoryId: string;
  subCategoryId?: string;
  saleUnit: Product['saleUnit'];
  description?: string;
  priceInCents: number | undefined;
}

export interface AdminProductEditorDialogResult {
  created?: boolean;
  updated?: boolean;
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
            @for (category of rootCategories; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.adminSpace.products.fields.subCategory' | transloco
          }}</mat-label>
          <mat-select formControlName="subCategoryId">
            <mat-option value="">{{
              'shell.adminSpace.products.fields.subCategoryOptional' | transloco
            }}</mat-option>
            @for (category of availableSubCategories; track category.id) {
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
      @if (apiErrorKey) {
        <div class="error-row" role="alert" aria-live="polite">
          <mat-icon aria-hidden="true">error_outline</mat-icon>
          <span>{{ apiErrorKey | transloco }}</span>
        </div>
      }
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
            : ('shell.adminSpace.products.actions.create' | transloco)
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

      .editor-form mat-form-field:has(mat-hint) {
        margin-block-end: 0.5rem;
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

      @media (max-width: 699px) {
        .editor-form {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminProductEditorDialogComponent implements OnInit {
  private readonly merchantsService = inject(MerchantsService);

  isEditMode: boolean;
  saving = false;
  apiErrorKey: string | null = null;

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
    subCategoryId: new FormControl('', { nonNullable: true }),
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
    this.form.controls.categoryId.valueChanges.subscribe((categoryId) => {
      const subCategoryId = this.form.controls.subCategoryId.value;
      if (!subCategoryId) {
        return;
      }

      const stillValid = this.availableSubCategories.some(
        (category) => category.id === subCategoryId,
      );

      if (!stillValid) {
        this.form.controls.subCategoryId.setValue('');
      }
    });

    if (this.isEditMode && this.data.product) {
      const p = this.data.product;
      this.form.patchValue({
        name: p.name,
        categoryId: p.category.id,
        subCategoryId: p.subCategory?.id ?? '',
        saleUnit: p.saleUnit,
        price: p.priceInCents == null ? '' : (p.priceInCents / 100).toFixed(2),
        description: p.description ?? '',
      });
    } else if (this.rootCategories.length > 0) {
      this.form.patchValue({
        categoryId: this.rootCategories[0].id,
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
      ...(this.form.controls.subCategoryId.value
        ? { subCategoryId: this.form.controls.subCategoryId.value }
        : {}),
      saleUnit: this.form.controls.saleUnit.value,
      description: this.form.controls.description.value.trim() || undefined,
      priceInCents: priceInCents ?? undefined,
    };

    this.saving = true;
    this.apiErrorKey = null;

    if (this.isEditMode && this.data.product) {
      const updatePayload: UpdateAdminCatalogProductPayload = payload;
      this.merchantsService
        .updateAdminCatalogProduct(this.data.product.id, updatePayload)
        .subscribe({
          next: () => {
            this.saving = false;
            this.dialogRef.close({
              updated: true,
            } as AdminProductEditorDialogResult);
          },
          error: (error) => {
            this.saving = false;
            this.apiErrorKey = this.mapApiError(error);
          },
        });
      return;
    }

    const createPayload: CreateAdminCatalogProductPayload = payload;
    this.merchantsService.createAdminCatalogProduct(createPayload).subscribe({
      next: () => {
        this.saving = false;
        this.dialogRef.close({
          created: true,
        } as AdminProductEditorDialogResult);
      },
      error: (error) => {
        this.saving = false;
        this.apiErrorKey = this.mapApiError(error);
      },
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  get rootCategories(): AdminProductCategory[] {
    return this.data.categories.filter(
      (category) => category.parentId === null,
    );
  }

  get availableSubCategories(): AdminProductCategory[] {
    const categoryId = this.form.controls.categoryId.value;
    if (!categoryId) {
      return [];
    }

    return this.data.categories.filter(
      (category) => category.parentId === categoryId,
    );
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

  private mapApiError(error: unknown): string {
    const code = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
    return (
      AUTH_ERROR_I18N_KEY_BY_CODE[code] ||
      'auth.apiErrors.INTERNAL_SERVER_ERROR'
    );
  }
}
