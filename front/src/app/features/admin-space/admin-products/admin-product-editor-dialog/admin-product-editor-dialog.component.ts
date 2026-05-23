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
import { AdminImageMetadataDraft } from '../../../../core/services/admin-image-upload.service';
import { extractApiErrorCode } from '../../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../../core/errors/auth-error-i18n-map';
import { Product } from '../../../../core/models/merchant-shop.model';
import { AdminImageUploadService } from '../../../../core/services/admin-image-upload.service';
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
  imageAssetId?: string;
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

        <div class="full-width image-section">
          <span class="image-section-label">{{
            'shell.adminSpace.products.fields.image' | transloco
          }}</span>

          <div class="image-panel">
            <div class="image-preview">
              @if (imagePreviewUrl) {
                <img
                  [src]="imagePreviewUrl"
                  [alt]="imagePreviewAlt"
                  loading="lazy"
                />
              } @else {
                <div class="image-placeholder" aria-hidden="true">
                  <mat-icon>image</mat-icon>
                </div>
              }
            </div>

            <div class="image-actions">
              <mat-form-field appearance="outline" class="full-inline">
                <mat-label>{{
                  'shell.adminSpace.products.fields.imageAltText' | transloco
                }}</mat-label>
                <input
                  matInput
                  type="text"
                  maxlength="500"
                  [value]="imageMeta.altText"
                  (input)="onImageMetaAltTextChange($any($event.target).value)"
                />
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-inline">
                <mat-label>{{
                  'shell.adminSpace.products.fields.imageDominantColor'
                    | transloco
                }}</mat-label>
                <input
                  matInput
                  type="text"
                  maxlength="7"
                  [value]="imageMeta.dominantColor"
                  (input)="
                    onImageMetaDominantColorChange($any($event.target).value)
                  "
                />
              </mat-form-field>

              <p class="image-hint">
                {{ 'shell.adminSpace.products.fields.imageHint' | transloco }}
              </p>

              <input
                #imageInput
                type="file"
                accept="image/*"
                class="visually-hidden"
                (change)="onImageSelected($event)"
              />

              <button
                mat-stroked-button
                type="button"
                [disabled]="saving || imageUploading"
                (click)="imageInput.click()"
              >
                <mat-icon aria-hidden="true">upload</mat-icon>
                {{
                  (imageAssetId
                    ? 'shell.adminSpace.products.actions.replaceImage'
                    : 'shell.adminSpace.products.actions.uploadImage'
                  ) | transloco
                }}
              </button>

              @if (imageUploading) {
                <div class="image-status" aria-live="polite">
                  <mat-spinner diameter="18"></mat-spinner>
                  <span>{{
                    'shell.adminSpace.products.messages.imageUploading'
                      | transloco
                  }}</span>
                </div>
              } @else if (imageAssetId) {
                <p class="image-success" aria-live="polite">
                  {{
                    'shell.adminSpace.products.messages.imageUploaded'
                      | transloco
                  }}
                </p>
              }

              @if (imageErrorKey) {
                <div
                  class="error-row image-error"
                  role="alert"
                  aria-live="polite"
                >
                  <mat-icon aria-hidden="true">error_outline</mat-icon>
                  <span>{{ imageErrorKey | transloco }}</span>
                </div>
              }
            </div>
          </div>
        </div>
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
        [disabled]="form.invalid || saving || imageUploading"
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

      .image-section {
        display: grid;
        gap: 0.75rem;
      }

      .image-section-label {
        font: var(--mat-sys-title-small);
      }

      .image-panel {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: minmax(0, 9rem) minmax(0, 1fr);
        align-items: start;
        padding: 0.75rem;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 1rem;
      }

      .image-preview {
        aspect-ratio: 1;
        border-radius: 0.875rem;
        overflow: hidden;
        background: color-mix(
          in srgb,
          var(--mat-sys-surface-variant) 75%,
          transparent
        );
        display: grid;
        place-items: center;
      }

      .image-preview img {
        inline-size: 100%;
        block-size: 100%;
        object-fit: cover;
      }

      .image-placeholder {
        color: var(--mat-sys-on-surface-variant);
      }

      .image-actions {
        display: grid;
        gap: 0.5rem;
        justify-items: start;
        inline-size: 100%;
      }

      .full-inline {
        inline-size: 100%;
      }

      .image-hint {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }

      .image-status {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      .image-success {
        margin: 0;
        color: #176b2c;
        font-weight: 600;
      }

      .image-error {
        margin-block-end: 0;
      }

      .visually-hidden {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
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

        .image-panel {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AdminProductEditorDialogComponent implements OnInit {
  private readonly merchantsService = inject(MerchantsService);
  private readonly adminImageUploadService = inject(AdminImageUploadService);

  isEditMode: boolean;
  saving = false;
  apiErrorKey: string | null = null;
  imageErrorKey: string | null = null;
  imageUploading = false;
  imageAssetId: string | null = null;
  imagePreviewUrl: string | null = null;
  imageMeta: AdminImageMetadataDraft = {
    altText: '',
    focalPointX: 0.5,
    focalPointY: 0.5,
    dominantColor: '',
  };

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

    this.form.controls.name.valueChanges.subscribe((name) => {
      if (!this.imageMeta.altText.trim()) {
        this.imageMeta = {
          ...this.imageMeta,
          altText: name.trim(),
        };
      }
    });

    if (this.isEditMode && this.data.product) {
      const p = this.data.product;
      this.imageAssetId = p.imageAsset?.id ?? null;
      this.imagePreviewUrl = p.imageAsset?.cdnUrl ?? null;
      this.imageMeta = {
        altText: p.imageAsset?.altText ?? p.name,
        focalPointX: p.imageAsset?.focalPointX ?? 0.5,
        focalPointY: p.imageAsset?.focalPointY ?? 0.5,
        dominantColor: p.imageAsset?.dominantColor ?? '',
      };
      this.form.patchValue({
        name: p.name,
        categoryId: p.category.id,
        subCategoryId: p.subCategory?.id ?? '',
        saleUnit: p.saleUnit,
        price: p.priceInCents == null ? '' : (p.priceInCents / 100).toFixed(2),
        description: p.description ?? '',
      });
    } else if (this.rootCategories.length > 0) {
      this.imageMeta = {
        ...this.imageMeta,
        altText: this.form.controls.name.value.trim(),
      };
      this.form.patchValue({
        categoryId: this.rootCategories[0].id,
      });
    }
  }

  submit(): void {
    if (this.saving || this.form.invalid || this.imageUploading) {
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
      ...(this.imageAssetId ? { imageAssetId: this.imageAssetId } : {}),
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

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';

    if (!file || this.imageUploading) {
      return;
    }

    this.imageUploading = true;
    this.imageErrorKey = null;

    this.adminImageUploadService
      .inferMetadata(
        file,
        this.imageMeta.altText || this.form.controls.name.value.trim(),
      )
      .then((autoMeta) => {
        this.imageMeta = {
          altText: this.imageMeta.altText || autoMeta.altText,
          focalPointX:
            this.normalizeFocalPoint(this.imageMeta.focalPointX) ??
            autoMeta.focalPointX,
          focalPointY:
            this.normalizeFocalPoint(this.imageMeta.focalPointY) ??
            autoMeta.focalPointY,
          dominantColor:
            this.normalizeDominantColor(this.imageMeta.dominantColor) ||
            autoMeta.dominantColor,
        };

        const metadata = this.validateAndBuildMetadata();
        if (!metadata) {
          this.imageUploading = false;
          return;
        }

        this.adminImageUploadService
          .uploadProductImage(file, metadata)
          .subscribe({
            next: (imageAsset) => {
              this.imageUploading = false;
              this.imageAssetId = imageAsset.id;
              this.imagePreviewUrl = imageAsset.cdnUrl;
              this.imageMeta = {
                altText: imageAsset.altText ?? metadata.altText,
                focalPointX: imageAsset.focalPointX ?? metadata.focalPointX,
                focalPointY: imageAsset.focalPointY ?? metadata.focalPointY,
                dominantColor:
                  imageAsset.dominantColor ?? metadata.dominantColor,
              };
            },
            error: (error) => {
              this.imageUploading = false;
              this.imageErrorKey = this.mapApiError(error);
            },
          });
      })
      .catch(() => {
        this.imageUploading = false;
        this.imageErrorKey = 'auth.apiErrors.VALIDATION_ERROR';
      });
  }

  onImageMetaAltTextChange(value: string): void {
    this.imageMeta = {
      ...this.imageMeta,
      altText: value,
    };
  }

  onImageMetaDominantColorChange(value: string): void {
    this.imageMeta = {
      ...this.imageMeta,
      dominantColor: value,
    };
  }

  private validateAndBuildMetadata(): {
    targetFolder: string;
    altText: string;
    focalPointX: number;
    focalPointY: number;
    dominantColor: string;
  } | null {
    const focalPointX = this.normalizeFocalPoint(this.imageMeta.focalPointX);
    const focalPointY = this.normalizeFocalPoint(this.imageMeta.focalPointY);
    const dominantColor = this.normalizeDominantColor(
      this.imageMeta.dominantColor,
    );

    if (focalPointX === null || focalPointY === null) {
      this.imageErrorKey = 'auth.apiErrors.VALIDATION_ERROR';
      return null;
    }

    this.imageMeta = {
      ...this.imageMeta,
      focalPointX,
      focalPointY,
      dominantColor,
    };

    return {
      targetFolder: 'products',
      altText:
        this.imageMeta.altText.trim() || this.form.controls.name.value.trim(),
      focalPointX,
      focalPointY,
      dominantColor,
    };
  }

  private normalizeFocalPoint(value: number): number | null {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return null;
    }

    return Math.round(value * 100) / 100;
  }

  private normalizeDominantColor(value: string): string {
    const normalized = value.trim();
    if (!normalized) {
      return '';
    }

    const withHash = normalized.startsWith('#') ? normalized : `#${normalized}`;
    return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toUpperCase() : '';
  }

  get imagePreviewAlt(): string {
    return this.form.controls.name.value.trim();
  }
}
