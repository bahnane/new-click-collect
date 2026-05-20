import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe } from '@jsverse/transloco';
import { AUTH_ERROR_I18N_KEY_BY_CODE } from '../../../core/errors/auth-error-i18n-map';
import { extractApiErrorCode } from '../../../core/errors/api-error.util';
import { MerchantShopService } from '../../../core/services/merchant-shop.service';
import { CartService } from '../../../core/services/cart.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AuthService } from '../../../core/services/auth.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';
import {
  MerchantShopInfo,
  Product,
  StoreOffersPaginatedResponse,
} from '../../../core/models/merchant-shop.model';

const LAST_MERCHANT_STORAGE_KEY = 'shop.lastMerchantSlug';

@Component({
  selector: 'app-merchant-shop',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    TranslocoPipe,
  ],
  templateUrl: './merchant-shop.component.html',
  styleUrl: './merchant-shop.component.scss',
})
export class MerchantShopComponent implements OnInit {
  private readonly merchantShopService = inject(MerchantShopService);
  private readonly cartService = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly uiFeedback = inject(UiFeedbackService);
  protected readonly languageService = inject(LanguageService);

  readonly merchantInfo = signal<MerchantShopInfo | null>(null);
  readonly products = signal<StoreOffersPaginatedResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly addToCartErrorKey = signal<string | null>(null);
  readonly addToCartSuccessKey = signal<string | null>(null);
  readonly addingOfferId = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = this.authService.isAuthenticated;

  readonly isMerchant = computed(() => this.currentUser()?.role === 'MERCHANT');
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');

  readonly businessTypeLabel = computed(() => {
    const type = this.merchantInfo()?.businessType;
    return type ? `shop.businessType.${type.toLowerCase()}` : '';
  });

  readonly isRtl = this.languageService.isRtl;
  readonly currentDirection = this.languageService.currentDirection;

  constructor() {
    effect(() => {
      const currentError = this.error() ?? this.addToCartErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
    effect(() => {
      const success = this.addToCartSuccessKey();
      if (success) {
        this.uiFeedback.showSuccessToast(success);
        this.addToCartSuccessKey.set(null);
      }
    });
  }

  ngOnInit(): void {
    const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
    if (!merchantSlug) {
      this.error.set('shop.merchantNotFound');
      this.loading.set(false);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LAST_MERCHANT_STORAGE_KEY, merchantSlug);
    }

    this.loadMerchantAndProducts(merchantSlug);
  }

  private loadMerchantAndProducts(merchantSlug: string): void {
    this.merchantShopService.getMerchantInfo(merchantSlug).subscribe({
      next: (info) => {
        this.merchantInfo.set(info);
        this.loadProducts(merchantSlug);
      },
      error: () => {
        this.error.set('shop.merchantNotFound');
        this.loading.set(false);
      },
    });
  }

  private loadProducts(merchantSlug: string, page = 1): void {
    this.merchantShopService.getMerchantProducts(merchantSlug, page).subscribe({
      next: (response) => {
        this.products.set(response);
        this.currentPage.set(page);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('shop.failedToLoadProducts');
        this.loading.set(false);
      },
    });
  }

  onPageChange(event: PageEvent): void {
    const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
    if (merchantSlug) {
      this.loading.set(true);
      this.loadProducts(merchantSlug, event.pageIndex + 1);
    }
  }

  getPrice(
    storeOfferPrice: number | null,
    productPrice: number | null,
  ): string {
    const price = storeOfferPrice ?? productPrice;
    if (!price) return '—';
    return (price / 100).toFixed(2);
  }

  getSaleUnit(unit: string): string {
    return `shop.saleUnit.${unit.toLowerCase()}`;
  }

  getProductCategoryLabel(product: Product): string {
    if (!product.subCategory?.name) {
      return product.category.name;
    }

    return `${product.category.name} / ${product.subCategory.name}`;
  }

  decreaseQuantityInput(
    input: HTMLInputElement,
    minOrderQty: number,
    stepQty: number,
  ): void {
    const safeMinOrderQty = this.toPositiveNumber(minOrderQty, 1);
    const safeStepQty = this.toPositiveNumber(stepQty, 1);
    const current =
      this.resolveQuantity(input.value, safeMinOrderQty, safeStepQty) ??
      safeMinOrderQty;
    const next = Math.max(safeMinOrderQty, current - safeStepQty);
    input.value = this.formatQuantity(next);
  }

  increaseQuantityInput(
    input: HTMLInputElement,
    minOrderQty: number,
    stepQty: number,
  ): void {
    const safeMinOrderQty = this.toPositiveNumber(minOrderQty, 1);
    const safeStepQty = this.toPositiveNumber(stepQty, 1);
    const current =
      this.resolveQuantity(input.value, safeMinOrderQty, safeStepQty) ??
      safeMinOrderQty;
    input.value = this.formatQuantity(current + safeStepQty);
  }

  addToCart(
    storeOfferId: string,
    minOrderQty: number,
    stepQty: number,
    quantityValue?: string,
  ): void {
    this.addToCartErrorKey.set(null);
    this.addToCartSuccessKey.set(null);

    if (!this.isAuthenticated()) {
      const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
      this.router.navigate(['/login'], {
        queryParams: merchantSlug ? { merchantSlug } : undefined,
      });
      return;
    }

    if (!this.isCustomer()) {
      this.addToCartErrorKey.set('shop.requiresCustomerRole');
      return;
    }

    const safeQuantity = this.resolveQuantity(
      quantityValue,
      minOrderQty,
      stepQty,
    );
    if (safeQuantity == null) {
      this.addToCartErrorKey.set('shop.quantityInvalid');
      return;
    }

    this.addingOfferId.set(storeOfferId);
    this.cartService.upsertMyCartItem(storeOfferId, safeQuantity).subscribe({
      next: () => {
        this.addingOfferId.set(null);
        this.addToCartSuccessKey.set('shop.addedToCart');
      },
      error: (error: unknown) => {
        this.addingOfferId.set(null);
        this.addToCartErrorKey.set(this.resolveAddToCartErrorMessageKey(error));
      },
    });
  }

  goToCart(): void {
    this.router.navigate(['/cart']);
  }

  logout(): void {
    this.authService.logout().subscribe();
  }

  setLanguage(language: 'fr' | 'ar'): void {
    if (this.isAuthenticated()) {
      this.authService.updatePreferredLanguage(language).subscribe();
      return;
    }

    this.languageService.setLanguage(language);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  private resolveAddToCartErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return AUTH_ERROR_I18N_KEY_BY_CODE[code] ?? 'shop.addToCartFailed';
    }

    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'auth.apiErrors.AUTH_UNAUTHORIZED';
    }

    return 'shop.addToCartFailed';
  }

  private resolveQuantity(
    quantityValue: string | undefined,
    minOrderQty: number,
    stepQty: number,
  ): number | null {
    const safeMinOrderQty =
      Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
    const safeStepQty = Number.isFinite(stepQty) && stepQty > 0 ? stepQty : 1;

    const normalizedRawValue = quantityValue?.trim() ?? '';
    const parsedQuantity =
      normalizedRawValue.length > 0
        ? Number(normalizedRawValue.replace(',', '.'))
        : safeMinOrderQty;

    if (!Number.isFinite(parsedQuantity)) {
      return null;
    }

    if (parsedQuantity < safeMinOrderQty) {
      return null;
    }

    const tolerance = 1e-9;
    const steps = (parsedQuantity - safeMinOrderQty) / safeStepQty;
    if (Math.abs(steps - Math.round(steps)) > tolerance) {
      return null;
    }

    return parsedQuantity;
  }

  private toPositiveNumber(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private formatQuantity(value: number): string {
    const rounded = Math.round(value * 1000) / 1000;
    return rounded.toString();
  }
}
