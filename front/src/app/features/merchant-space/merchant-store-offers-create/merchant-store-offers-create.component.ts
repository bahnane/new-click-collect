import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import {
  CatalogProductsPaginatedResponse,
  CreateStoreOfferPayload,
  MerchantsService,
} from '../../../core/services/merchants.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

interface OfferDraftRow {
  productId: string;
  productName: string;
  categoryName: string;
  saleUnit: string;
  imageUrl: string | null;
  imageAltText: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  defaultPriceInCents: number | null;
  selected: boolean;
  price: string;
  minOrderQty: string;
  stepQty: string;
  maxOrderQty: string;
}

@Component({
  selector: 'app-merchant-store-offers-create',
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatCheckboxModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './merchant-store-offers-create.component.html',
  styleUrl: './merchant-store-offers-create.component.scss',
})
export class MerchantStoreOffersCreateComponent {
  private readonly merchantsService = inject(MerchantsService);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly loading = signal(false);
  readonly creatingOffer = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly catalogPage = signal<CatalogProductsPaginatedResponse | null>(null);
  readonly businessTypeId = signal<string | null>(null);
  readonly draftRows = signal<OfferDraftRow[]>([]);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly displayedColumns = [
    'image',
    'select',
    'product',
    'price',
    'minOrderQty',
    'stepQty',
    'maxOrderQty',
  ];

  readonly isEmpty = computed(() => {
    const page = this.catalogPage();
    return !this.loading() && page && page.data.length === 0;
  });

  readonly selectedDraftCount = computed(
    () => this.draftRows().filter((row) => row.selected).length,
  );

  constructor() {
    effect(() => {
      const currentError = this.errorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
    this.loadMerchantProfile();
  }

  private loadMerchantProfile(): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.merchantsService.getMyProfile().subscribe({
      next: (profile) => {
        this.businessTypeId.set(profile.businessType.id);
        this.loadCatalogProducts();
      },
      error: (error) => {
        this.errorKey.set(this.mapApiError(error));
        this.loading.set(false);
      },
    });
  }

  loadCatalogProducts(
    page = this.currentPage(),
    pageSize = this.pageSize(),
  ): void {
    this.loading.set(true);
    this.errorKey.set(null);

    const businessTypeId = this.businessTypeId();
    if (!businessTypeId) {
      return;
    }

    this.merchantsService
      .getCatalogProducts(page, pageSize, businessTypeId)
      .subscribe({
        next: (response) => {
          this.catalogPage.set(response);
          this.currentPage.set(response.page);
          this.pageSize.set(response.pageSize);
          this.draftRows.set(
            response.data.map((product) => ({
              productId: product.id,
              productName: product.name,
              categoryName: product.subCategory
                ? `${product.category.name} / ${product.subCategory.name}`
                : product.category.name,
              saleUnit: product.saleUnit,
              imageUrl: product.imageAsset?.cdnUrl ?? null,
              imageAltText: product.imageAsset?.altText ?? null,
              imageWidth: product.imageAsset?.width ?? null,
              imageHeight: product.imageAsset?.height ?? null,
              defaultPriceInCents: product.priceInCents,
              selected: false,
              price: '',
              minOrderQty: '1',
              stepQty: '1',
              maxOrderQty: '',
            })),
          );
          this.loading.set(false);
        },
        error: (error) => {
          this.errorKey.set(this.mapApiError(error));
          this.loading.set(false);
        },
      });
  }

  onCatalogPageChange(event: PageEvent): void {
    this.loadCatalogProducts(event.pageIndex + 1, event.pageSize);
  }

  onDraftSelectionChange(productId: string, selected: boolean): void {
    this.draftRows.update((rows) =>
      rows.map((row) =>
        row.productId === productId ? { ...row, selected } : row,
      ),
    );
  }

  onDraftInputChange(
    productId: string,
    field: 'price' | 'minOrderQty' | 'stepQty' | 'maxOrderQty',
    value: string,
  ): void {
    this.draftRows.update((rows) =>
      rows.map((row) =>
        row.productId === productId ? { ...row, [field]: value } : row,
      ),
    );
  }

  onCreateOffersBatch(): void {
    if (this.creatingOffer()) {
      return;
    }

    const selectedRows = this.draftRows().filter((row) => row.selected);
    if (selectedRows.length === 0) {
      this.errorKey.set(
        'shell.merchant.storeOffers.create.validation.noSelection',
      );
      return;
    }

    const payloads: CreateStoreOfferPayload[] = [];
    for (const row of selectedRows) {
      const minOrderQty = this.parsePositiveDecimal(row.minOrderQty);
      const stepQty = this.parsePositiveDecimal(row.stepQty);
      const maxOrderQty = row.maxOrderQty.trim()
        ? this.parsePositiveDecimal(row.maxOrderQty)
        : undefined;
      const priceInCents = this.parsePriceToCents(row.price);

      if (
        minOrderQty == null ||
        stepQty == null ||
        priceInCents === null ||
        (row.maxOrderQty.trim().length > 0 && maxOrderQty == null)
      ) {
        this.errorKey.set(
          'shell.merchant.storeOffers.create.validation.invalidValues',
        );
        return;
      }

      payloads.push({
        productId: row.productId,
        minOrderQty,
        stepQty,
        ...(priceInCents !== undefined ? { priceInCents } : {}),
        ...(maxOrderQty != null ? { maxOrderQty } : {}),
      });
    }

    this.creatingOffer.set(true);
    this.errorKey.set(null);

    this.merchantsService.createOffersBatch(payloads).subscribe({
      next: () => {
        this.creatingOffer.set(false);
        this.loadCatalogProducts(this.currentPage(), this.pageSize());
      },
      error: (error) => {
        this.creatingOffer.set(false);
        const errorCode = extractApiErrorCode(error) || 'INTERNAL_SERVER_ERROR';
        const translatedKey =
          AUTH_ERROR_I18N_KEY_BY_CODE[errorCode] ||
          'auth.apiErrors.INTERNAL_SERVER_ERROR';
        this.errorKey.set(translatedKey);
      },
    });
  }

  clearErrorKey(): void {
    this.errorKey.set(null);
    this.uiFeedback.clearError();
  }

  formatPrice(priceInCents: number | null): string {
    if (priceInCents === null) {
      return '—';
    }

    return (priceInCents / 100).toFixed(2);
  }

  getSaleUnitLabel(saleUnit: string): string {
    return `shop.saleUnit.${saleUnit.toLowerCase()}`;
  }

  private parsePositiveDecimal(value: string): number | null {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed;
  }

  private parsePriceToCents(value: string): number | undefined | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
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
