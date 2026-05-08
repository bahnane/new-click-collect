import { CommonModule } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import {
  Product,
  ProductCategory,
} from '../../../core/models/merchant-shop.model';
import {
  CreateProductSubmissionPayload,
  MerchantsService,
  ProductSubmission,
  ProductSubmissionsPaginatedResponse,
  SimilarCatalogProduct,
  UpdateProductSubmissionPayload,
} from '../../../core/services/merchants.service';
import { DeleteConfirmationDialogComponent } from '../../../shared/dialogs/delete-confirmation-dialog/delete-confirmation-dialog.component';
import {
  CreateOfferFromSuggestionDialogComponent,
  CreateOfferFromSuggestionDialogResult,
} from '../../../shared/dialogs/create-offer-from-suggestion-dialog/create-offer-from-suggestion-dialog.component';

@Component({
  selector: 'app-merchant-product-submissions',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    TranslocoPipe,
  ],
  templateUrl: './merchant-product-submissions.component.html',
  styleUrl: './merchant-product-submissions.component.scss',
})
export class MerchantProductSubmissionsComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly deletingSubmissionId = signal<string | null>(null);
  readonly creatingOfferForId = signal<string | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly successKey = signal<string | null>(null);

  readonly page = signal<ProductSubmissionsPaginatedResponse | null>(null);
  readonly categories = signal<ProductCategory[]>([]);
  readonly similarProducts = signal<SimilarCatalogProduct[]>([]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly editorOpen = signal(false);
  readonly editingSubmissionId = signal<string | null>(null);

  readonly displayedColumns = [
    'name',
    'category',
    'saleUnit',
    'price',
    'status',
    'actions',
  ];

  readonly form = new FormGroup({
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

  readonly isEmpty = computed(() => {
    const current = this.page();
    return !this.loading() && current && current.data.length === 0;
  });

  readonly isEditMode = computed(() => this.editingSubmissionId() !== null);

  constructor() {
    this.loadInitialData();
    this.bindSimilarProductsSearch();
  }

  loadInitialData(): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.getProductCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        if (categories.length > 0 && !this.form.controls.categoryId.value) {
          this.form.controls.categoryId.setValue(categories[0].id);
        }
        this.loadSubmissions();
      },
      error: (error) => {
        this.errorKey.set(this.mapApiError(error));
        this.loading.set(false);
      },
    });
  }

  loadSubmissions(page = this.currentPage(), pageSize = this.pageSize()): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.getMyProductSubmissions(page, pageSize).subscribe({
      next: (response) => {
        this.page.set(response);
        this.currentPage.set(response.page);
        this.pageSize.set(response.pageSize);
        this.loading.set(false);
      },
      error: (error) => {
        this.errorKey.set(this.mapApiError(error));
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    this.loadSubmissions(event.pageIndex + 1, event.pageSize);
  }

  onOpenCreate(): void {
    this.successKey.set(null);
    this.actionErrorKey.set(null);
    this.editorOpen.set(true);
    this.editingSubmissionId.set(null);
    this.form.reset({
      name: '',
      categoryId: this.categories()[0]?.id ?? '',
      saleUnit: 'UNIT',
      price: '',
      description: '',
    });
    this.similarProducts.set([]);
  }

  onEdit(submission: ProductSubmission): void {
    if (!this.canMutate(submission)) {
      return;
    }

    this.successKey.set(null);
    this.actionErrorKey.set(null);
    this.editorOpen.set(true);
    this.editingSubmissionId.set(submission.id);
    this.form.reset({
      name: submission.name,
      categoryId: submission.category.id,
      saleUnit: submission.saleUnit,
      price:
        submission.priceInCents == null
          ? ''
          : (submission.priceInCents / 100).toFixed(2),
      description: submission.description ?? '',
    });
  }

  onCancelEditor(): void {
    this.editorOpen.set(false);
    this.editingSubmissionId.set(null);
    this.similarProducts.set([]);
    this.form.reset({
      name: '',
      categoryId: this.categories()[0]?.id ?? '',
      saleUnit: 'UNIT',
      price: '',
      description: '',
    });
  }

  onSubmitForm(): void {
    if (this.saving()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.actionErrorKey.set('auth.apiErrors.VALIDATION_ERROR');
      return;
    }

    const priceInCents = this.parsePriceToCents(this.form.controls.price.value);
    if (priceInCents === undefined) {
      this.actionErrorKey.set('auth.apiErrors.VALIDATION_ERROR');
      return;
    }

    const payloadBase = {
      name: this.form.controls.name.value.trim(),
      categoryId: this.form.controls.categoryId.value,
      saleUnit: this.form.controls.saleUnit.value,
      description: this.form.controls.description.value.trim() || undefined,
    };

    this.saving.set(true);
    this.actionErrorKey.set(null);

    const editingId = this.editingSubmissionId();
    if (editingId) {
      const payload: UpdateProductSubmissionPayload = {
        ...payloadBase,
        priceInCents,
      };

      this.merchantsService
        .updateProductSubmission(editingId, payload)
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.successKey.set(
              'shell.merchant.productSubmissions.messages.updated',
            );
            this.onCancelEditor();
            this.loadSubmissions(this.currentPage(), this.pageSize());
          },
          error: (error) => {
            this.saving.set(false);
            this.actionErrorKey.set(this.mapApiError(error));
          },
        });

      return;
    }

    const payload: CreateProductSubmissionPayload = {
      ...payloadBase,
      ...(priceInCents == null ? {} : { priceInCents }),
    };

    this.merchantsService.createProductSubmission(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.successKey.set(
          'shell.merchant.productSubmissions.messages.created',
        );
        this.onCancelEditor();
        this.loadSubmissions(1, this.pageSize());
      },
      error: (error) => {
        this.saving.set(false);
        this.actionErrorKey.set(this.mapApiError(error));
      },
    });
  }

  onDelete(submission: ProductSubmission): void {
    if (
      !this.canMutate(submission) ||
      this.deletingSubmissionId() === submission.id
    ) {
      return;
    }

    const dialogRef = this.dialog.open(DeleteConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'shell.merchant.productSubmissions.deleteConfirm.title',
        message: 'shell.merchant.productSubmissions.deleteConfirm.message',
        confirmLabel: 'common.delete',
        confirmColor: 'warn',
        itemName: submission.name,
      },
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (!confirmed) {
        return;
      }

      this.deletingSubmissionId.set(submission.id);
      this.actionErrorKey.set(null);
      this.merchantsService.deleteProductSubmission(submission.id).subscribe({
        next: () => {
          this.deletingSubmissionId.set(null);
          this.successKey.set(
            'shell.merchant.productSubmissions.messages.deleted',
          );
          this.loadSubmissions(this.currentPage(), this.pageSize());
        },
        error: (error) => {
          this.deletingSubmissionId.set(null);
          this.actionErrorKey.set(this.mapApiError(error));
        },
      });
    });
  }

  onCreateOfferFromSuggestion(product: SimilarCatalogProduct): void {
    const dialogRef = this.dialog.open(
      CreateOfferFromSuggestionDialogComponent,
      {
        width: '400px',
        data: { product },
      },
    );

    dialogRef
      .afterClosed()
      .subscribe(
        (result: CreateOfferFromSuggestionDialogResult | undefined) => {
          if (!result) {
            return;
          }

          this.creatingOfferForId.set(product.id);
          this.actionErrorKey.set(null);

          this.merchantsService
            .createOffer({
              productId: product.id,
              ...result,
            })
            .subscribe({
              next: () => {
                this.creatingOfferForId.set(null);
                this.successKey.set(
                  'shell.merchant.productSubmissions.messages.offerCreated',
                );
              },
              error: (error) => {
                this.creatingOfferForId.set(null);
                this.actionErrorKey.set(this.mapApiError(error));
              },
            });
        },
      );
  }

  clearErrorKey(): void {
    this.errorKey.set(null);
  }

  clearActionErrorKey(): void {
    this.actionErrorKey.set(null);
  }

  getSaleUnitLabel(saleUnit: Product['saleUnit']): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  getStatusLabel(status: string): string {
    return `shell.merchant.productSubmissions.status.${status.toLowerCase()}`;
  }

  canMutate(submission: ProductSubmission): boolean {
    return submission.status === 'PENDING';
  }

  formatPrice(priceInCents: number | null): string {
    if (priceInCents == null) {
      return '-';
    }

    return (priceInCents / 100).toFixed(2);
  }

  private bindSimilarProductsSearch(): void {
    this.form.controls.name.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((value) => {
          const label = value.trim();
          if (!this.editorOpen() || label.length < 2) {
            return of([] as SimilarCatalogProduct[]);
          }

          return this.merchantsService
            .searchSimilarCatalogProducts(label, 6)
            .pipe(catchError(() => of([] as SimilarCatalogProduct[])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((products) => {
        this.similarProducts.set(products);
      });
  }

  private parsePriceToCents(value: string): number | null | undefined {
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

  private mapApiError(error: unknown): string {
    const errorCode = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
    return (
      AUTH_ERROR_I18N_KEY_BY_CODE[errorCode] ||
      'auth.apiErrors.INTERNAL_SERVER_ERROR'
    );
  }
}
