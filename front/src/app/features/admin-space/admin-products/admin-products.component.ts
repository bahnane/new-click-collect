import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
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
  MerchantsService,
} from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';
import {
  AdminProductEditorDialogComponent,
  AdminProductEditorDialogResult,
} from './admin-product-editor-dialog/admin-product-editor-dialog.component';

@Component({
  selector: 'app-admin-products',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTableModule,
    TranslocoPipe,
  ],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.scss',
})
export class AdminProductsComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly dialog = inject(MatDialog);
  private readonly uiFeedback = inject(UiFeedbackService);

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

  readonly displayedColumns = [
    'name',
    'category',
    'saleUnit',
    'price',
    'status',
    'offersCount',
    'actions',
  ];

  readonly isEmpty = computed(() => {
    const current = this.page();
    return !this.loading() && current !== null && current.data.length === 0;
  });

  constructor() {
    effect(() => {
      const currentError = this.errorKey() ?? this.actionErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
    effect(() => {
      const success = this.successKey();
      if (success) {
        this.uiFeedback.showSuccessToast(success);
        this.successKey.set(null);
      }
    });
    this.loadInitialData();
  }

  loadInitialData(): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.listAdminProductCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
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

    const dialogRef = this.dialog.open(AdminProductEditorDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        categories: this.categories(),
        isEditMode: false,
      },
    });

    dialogRef
      .afterClosed()
      .subscribe((result: AdminProductEditorDialogResult | undefined) => {
        if (!result) {
          return;
        }

        if (result.created) {
          this.successKey.set('shell.adminSpace.products.messages.created');
          this.loadProducts(1, this.pageSize());
        }
      });
  }

  onEdit(product: AdminCatalogProduct): void {
    this.successKey.set(null);
    this.actionErrorKey.set(null);

    const dialogRef = this.dialog.open(AdminProductEditorDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        product,
        categories: this.categories(),
        isEditMode: true,
      },
    });

    dialogRef
      .afterClosed()
      .subscribe((result: AdminProductEditorDialogResult | undefined) => {
        if (!result) {
          return;
        }

        if (result.updated) {
          this.successKey.set('shell.adminSpace.products.messages.updated');
          this.loadProducts(this.currentPage(), this.pageSize());
        }
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
    this.uiFeedback.clearError();
  }

  clearActionErrorKey(): void {
    this.actionErrorKey.set(null);
    this.uiFeedback.clearError();
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

  private mapApiError(error: unknown): string {
    const code = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
    return (
      AUTH_ERROR_I18N_KEY_BY_CODE[code] ||
      'auth.apiErrors.INTERNAL_SERVER_ERROR'
    );
  }
}
