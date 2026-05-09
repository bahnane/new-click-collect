import { Component, DestroyRef, Inject, OnInit, inject } from '@angular/core';
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
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  of,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Product,
  ProductCategory,
} from '../../../../core/models/merchant-shop.model';
import {
  ProductSubmission,
  MerchantsService,
  SimilarCatalogProduct,
} from '../../../../core/services/merchants.service';

export interface SubmissionEditorDialogData {
  submission?: ProductSubmission;
  categories: ProductCategory[];
  isEditMode: boolean;
}

@Component({
  selector: 'app-submission-editor-dialog',
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
          ? ('shell.merchant.productSubmissions.editor.editTitle' | transloco)
          : ('shell.merchant.productSubmissions.editor.createTitle' | transloco)
      }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="editor-form">
        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.merchant.productSubmissions.fields.name' | transloco
          }}</mat-label>
          <input matInput type="text" formControlName="name" />
        </mat-form-field>

        @if (similarProducts.length > 0) {
          <div class="similar-products" role="status" aria-live="polite">
            <p>
              {{
                'shell.merchant.productSubmissions.similar.title' | transloco
              }}
            </p>
            <ul>
              @for (product of similarProducts; track product.id) {
                <li>
                  <div class="similar-product-info">
                    <span>{{ product.name }}</span>
                    <small>
                      {{ product.category.name }} /
                      {{ getSaleUnitLabel(product.saleUnit) | transloco }}
                    </small>
                  </div>
                  <button
                    mat-stroked-button
                    color="primary"
                    type="button"
                    [disabled]="creatingOfferForId === product.id"
                    (click)="onCreateOfferFromSuggestion(product)"
                    [attr.aria-label]="
                      'shell.merchant.productSubmissions.actions.createOffer'
                        | transloco
                    "
                  >
                    @if (creatingOfferForId === product.id) {
                      <mat-spinner diameter="14"></mat-spinner>
                    } @else {
                      <mat-icon aria-hidden="true">add_shopping_cart</mat-icon>
                    }
                    {{
                      'shell.merchant.productSubmissions.actions.createOffer'
                        | transloco
                    }}
                  </button>
                </li>
              }
            </ul>
          </div>
        }

        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.merchant.productSubmissions.fields.category' | transloco
          }}</mat-label>
          <mat-select formControlName="categoryId">
            @for (category of data.categories; track category.id) {
              <mat-option [value]="category.id">{{ category.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>{{
            'shell.merchant.productSubmissions.fields.saleUnit' | transloco
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
            'shell.merchant.productSubmissions.fields.price' | transloco
          }}</mat-label>
          <input
            matInput
            type="text"
            inputmode="decimal"
            formControlName="price"
          />
          <mat-hint>{{
            'shell.merchant.productSubmissions.fields.priceHint' | transloco
          }}</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{
            'shell.merchant.productSubmissions.fields.description' | transloco
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
            : ('shell.merchant.productSubmissions.actions.submit' | transloco)
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

      .similar-products {
        grid-column: 1 / -1;
        padding: 0.75rem;
        border-radius: 0.75rem;
        background: var(--mat-sys-surface-container-low);
        border: 1px dashed var(--mat-sys-outline-variant);
      }

      .similar-products p {
        margin: 0 0 0.5rem;
        font-weight: 600;
      }

      .similar-products ul {
        margin: 0;
        padding-inline-start: 0;
        list-style: none;
        display: grid;
        gap: 0.5rem;
      }

      .similar-products li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }

      .similar-product-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .similar-product-info small {
        color: var(--mat-sys-on-surface-variant);
        font-size: 0.8rem;
      }

      @media (max-width: 699px) {
        .editor-form {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class SubmissionEditorDialogComponent implements OnInit {
  private readonly merchantsService = inject(MerchantsService);
  private readonly destroyRef = inject(DestroyRef);

  isEditMode: boolean;
  saving = false;
  similarProducts: SimilarCatalogProduct[] = [];
  creatingOfferForId: string | null = null;

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
    description: new FormControl('', { nonNullable: true }),
  });

  constructor(
    public dialogRef: MatDialogRef<SubmissionEditorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SubmissionEditorDialogData,
  ) {
    this.isEditMode = data.isEditMode;
  }

  ngOnInit(): void {
    if (this.isEditMode && this.data.submission) {
      const s = this.data.submission;
      this.form.patchValue({
        name: s.name,
        categoryId: s.category.id,
        saleUnit: s.saleUnit,
        price: s.priceInCents == null ? '' : (s.priceInCents / 100).toFixed(2),
        description: s.description ?? '',
      });
    } else if (this.data.categories.length > 0) {
      this.form.patchValue({
        categoryId: this.data.categories[0].id,
      });
    }

    this.bindSimilarProductsSearch();
  }

  submit(): void {
    if (this.saving || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const priceInCents = this.parsePriceToCents(this.form.controls.price.value);
    if (priceInCents === undefined) {
      return;
    }

    const payload = {
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

  onCreateOfferFromSuggestion(product: SimilarCatalogProduct): void {
    // This would typically open another dialog, but for now we'll skip it
    // or handle it via callback in the parent component
  }

  getSaleUnitLabel(saleUnit: Product['saleUnit']): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  private bindSimilarProductsSearch(): void {
    this.form.controls.name.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((value) => {
          const label = value.trim();
          if (label.length < 2) {
            return of([] as SimilarCatalogProduct[]);
          }
          return this.merchantsService
            .searchSimilarCatalogProducts(label, 6)
            .pipe(catchError(() => of([] as SimilarCatalogProduct[])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((products) => {
        this.similarProducts = products;
      });
  }

  private parsePriceToCents(value: string): number | undefined | null {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }
    return Math.round(parsed * 100);
  }
}
