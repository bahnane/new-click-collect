import { Component, computed, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTableModule } from '@angular/material/table';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { Product } from '../../../core/models/merchant-shop.model';
import {
  AdminCatalogProduct,
  AdminCatalogProductsPaginatedResponse,
  AdminProductCategory,
  CreateAdminCatalogProductPayload,
  MerchantsService,
  UpdateAdminCatalogProductPayload,
} from '../../../core/services/merchants.service';

@Component({
  selector: 'app-admin-products',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTableModule,
    TranslocoPipe,
  ],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.scss',
})
export class AdminProductsComponent {
  private readonly merchantsService = inject(MerchantsService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly togglingProductId = signal<string | null>(null);
  readonly errorKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly successKey = signal<string | null>(null);

  readonly page = signal<AdminCatalogProductsPaginatedResponse | null>(null);
  readonly categories = signal<AdminProductCategory[]>([]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly editorOpen = signal(false);
  readonly editingProductId = signal<string | null>(null);

  readonly displayedColumns = [
    'name',
    'category',
    'saleUnit',
    'price',
    'status',
    'offersCount',
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
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(2000)],
    }),
  });

  readonly isEmpty = computed(() => {
    const current = this.page();
    return !this.loading() && current !== null && current.data.length === 0;
  });

  readonly isEditMode = computed(() => this.editingProductId() !== null);

  constructor() {
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.listAdminProductCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        if (categories.length > 0 && !this.form.controls.categoryId.value) {
          this.form.controls.categoryId.setValue(categories[0].id);
        }
        this.loadProducts();
      },
      error: (error) => {
        this.errorKey.set(this.mapApiError(error));
        this.loading.set(false);
      },
    });
  }

  loadProducts(page = this.currentPage(), pageSize = this.pageSize()): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.listAdminCatalogProducts(page, pageSize).subscribe({
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
    this.loadProducts(event.pageIndex + 1, event.pageSize);
  }

  onOpenCreate(): void {
    this.successKey.set(null);
    this.actionErrorKey.set(null);
    this.editorOpen.set(true);
    this.editingProductId.set(null);
    this.form.reset({
      name: '',
      categoryId: this.categories()[0]?.id ?? '',
      saleUnit: 'UNIT',
      price: '',
      description: '',
    });
  }

  onEdit(product: AdminCatalogProduct): void {
    this.successKey.set(null);
    this.actionErrorKey.set(null);
    this.editorOpen.set(true);
    this.editingProductId.set(product.id);
    this.form.reset({
      name: product.name,
      categoryId: product.category.id,
      saleUnit: product.saleUnit,
      price:
        product.priceInCents == null
          ? ''
          : (product.priceInCents / 100).toFixed(2),
      description: product.description ?? '',
    });
  }

  onCancelEditor(): void {
    this.editorOpen.set(false);
    this.editingProductId.set(null);
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

    const parsedPrice = this.parsePriceToCents(this.form.controls.price.value);
    if (parsedPrice === null) {
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

    const editingId = this.editingProductId();
    if (editingId) {
      const payload: UpdateAdminCatalogProductPayload = {
        ...payloadBase,
        ...(parsedPrice === undefined ? {} : { priceInCents: parsedPrice }),
      };

      this.merchantsService
        .updateAdminCatalogProduct(editingId, payload)
        .subscribe({
          next: () => {
            this.saving.set(false);
            this.successKey.set('shell.adminSpace.products.messages.updated');
            this.onCancelEditor();
            this.loadProducts(this.currentPage(), this.pageSize());
          },
          error: (error) => {
            this.saving.set(false);
            this.actionErrorKey.set(this.mapApiError(error));
          },
        });
      return;
    }

    const payload: CreateAdminCatalogProductPayload = {
      ...payloadBase,
      ...(parsedPrice === undefined ? {} : { priceInCents: parsedPrice }),
    };

    this.merchantsService.createAdminCatalogProduct(payload).subscribe({
      next: () => {
        this.saving.set(false);
        this.successKey.set('shell.adminSpace.products.messages.created');
        this.onCancelEditor();
        this.loadProducts(1, this.pageSize());
      },
      error: (error) => {
        this.saving.set(false);
        this.actionErrorKey.set(this.mapApiError(error));
      },
    });
  }

  onToggleActivation(product: AdminCatalogProduct): void {
    if (this.togglingProductId() || this.saving()) {
      return;
    }

    this.togglingProductId.set(product.id);
    this.actionErrorKey.set(null);

    this.merchantsService.toggleAdminCatalogProduct(product.id).subscribe({
      next: () => {
        this.togglingProductId.set(null);
        this.successKey.set(
          product.isActive
            ? 'shell.adminSpace.products.messages.deactivated'
            : 'shell.adminSpace.products.messages.activated',
        );
        this.loadProducts(this.currentPage(), this.pageSize());
      },
      error: (error) => {
        this.togglingProductId.set(null);
        this.actionErrorKey.set(this.mapApiError(error));
      },
    });
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

  getStatusLabel(isActive: boolean): string {
    return isActive
      ? 'shell.adminSpace.products.status.active'
      : 'shell.adminSpace.products.status.inactive';
  }

  formatPrice(priceInCents: number | null): string {
    if (priceInCents == null) {
      return '-';
    }

    return (priceInCents / 100).toFixed(2);
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
