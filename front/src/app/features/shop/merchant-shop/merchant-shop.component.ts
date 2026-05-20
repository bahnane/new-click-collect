import {
  ElementRef,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
  PublicStoreOffersCursorResponse,
  Product,
  StoreOffer,
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
    TranslocoPipe,
  ],
  templateUrl: './merchant-shop.component.html',
  styleUrl: './merchant-shop.component.scss',
})
export class MerchantShopComponent implements OnInit, OnDestroy {
  private readonly merchantShopService = inject(MerchantShopService);
  private readonly cartService = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly uiFeedback = inject(UiFeedbackService);
  protected readonly languageService = inject(LanguageService);
  private observer: IntersectionObserver | null = null;
  private readonly pageSize = 24;
  private readonly maxAutoLoadBatches = 2;

  readonly merchantInfo = signal<MerchantShopInfo | null>(null);
  readonly offers = signal<StoreOffer[]>([]);
  readonly productsLoaded = signal(false);
  readonly loadingMore = signal(false);
  readonly nextCursor = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly manualLoadMode = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly feedErrorKey = signal<string | null>(null);
  readonly addToCartErrorKey = signal<string | null>(null);
  readonly addToCartSuccessKey = signal<string | null>(null);
  readonly addingOfferId = signal<string | null>(null);
  readonly searchInputValue = signal('');
  readonly activeSearchQuery = signal('');
  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = this.authService.isAuthenticated;

  private searchDebounceHandle: ReturnType<typeof setTimeout> | null = null;
  private readonly searchDebounceMs = 350;
  private productsRequestSeq = 0;
  private autoLoadedBatchCount = 0;

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
      const currentError =
        this.error() ?? this.feedErrorKey() ?? this.addToCartErrorKey();
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

  ngOnDestroy(): void {
    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
      this.searchDebounceHandle = null;
    }

    this.disconnectObserver();
  }

  @ViewChild('loadMoreSentinel')
  set loadMoreSentinel(element: ElementRef<HTMLDivElement> | undefined) {
    this.disconnectObserver();

    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          this.loadNextPage('auto');
        }
      },
      { rootMargin: '320px 0px' },
    );

    this.observer.observe(element.nativeElement);
  }

  private loadMerchantAndProducts(merchantSlug: string): void {
    this.merchantShopService.getMerchantInfo(merchantSlug).subscribe({
      next: (info) => {
        this.merchantInfo.set(info);
        this.loadProducts(merchantSlug, { reset: true });
      },
      error: () => {
        this.error.set('shop.merchantNotFound');
        this.loading.set(false);
      },
    });
  }

  private loadProducts(
    merchantSlug: string,
    options: {
      reset?: boolean;
      query?: string;
    } = {},
  ): void {
    const reset = options.reset ?? false;
    const query = options.query ?? this.activeSearchQuery();
    const cursor = reset ? undefined : (this.nextCursor() ?? undefined);

    if (!reset && (!this.hasMore() || this.loadingMore() || this.loading())) {
      return;
    }

    if (reset) {
      this.loading.set(true);
      this.productsLoaded.set(false);
      this.feedErrorKey.set(null);
      this.error.set(null);
      this.offers.set([]);
      this.nextCursor.set(null);
      this.hasMore.set(false);
      this.manualLoadMode.set(false);
      this.autoLoadedBatchCount = 0;
    } else {
      this.loadingMore.set(true);
      this.feedErrorKey.set(null);
    }

    const requestSeq = ++this.productsRequestSeq;
    this.merchantShopService
      .getMerchantProducts(merchantSlug, this.pageSize, cursor, query)
      .subscribe({
        next: (response: PublicStoreOffersCursorResponse) => {
          if (requestSeq !== this.productsRequestSeq) {
            return;
          }

          const nextData = reset
            ? response.data
            : this.mergeOffers(this.offers(), response.data);

          this.offers.set(nextData);
          this.nextCursor.set(response.nextCursor);
          this.hasMore.set(response.hasMore);
          if (!reset && response.data.length > 0) {
            this.autoLoadedBatchCount += 1;
            if (this.autoLoadedBatchCount >= this.maxAutoLoadBatches) {
              this.manualLoadMode.set(true);
            }
          }
          this.productsLoaded.set(true);
          this.loading.set(false);
          this.loadingMore.set(false);
        },
        error: () => {
          if (requestSeq !== this.productsRequestSeq) {
            return;
          }

          if (reset) {
            this.error.set('shop.failedToLoadProducts');
            this.loading.set(false);
            this.productsLoaded.set(true);
          } else {
            this.feedErrorKey.set('shop.failedToLoadProducts');
            this.loadingMore.set(false);
          }
        },
      });
  }

  loadNextPage(trigger: 'auto' | 'manual' = 'manual'): void {
    const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
    if (!merchantSlug) {
      return;
    }

    if (trigger === 'auto' && this.manualLoadMode()) {
      return;
    }

    this.loadProducts(merchantSlug, {
      reset: false,
      query: this.activeSearchQuery(),
    });
  }

  onSearchInput(rawValue: string): void {
    this.searchInputValue.set(rawValue);

    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
    }

    this.searchDebounceHandle = setTimeout(() => {
      const normalized = this.searchInputValue().trim();
      if (normalized === this.activeSearchQuery()) {
        return;
      }

      this.activeSearchQuery.set(normalized);
      const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
      if (!merchantSlug) {
        return;
      }

      this.loadProducts(merchantSlug, { reset: true, query: normalized });
    }, this.searchDebounceMs);
  }

  clearSearch(): void {
    if (this.searchInputValue() === '' && this.activeSearchQuery() === '') {
      return;
    }

    if (this.searchDebounceHandle) {
      clearTimeout(this.searchDebounceHandle);
      this.searchDebounceHandle = null;
    }

    this.searchInputValue.set('');
    this.activeSearchQuery.set('');

    const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
    if (!merchantSlug) {
      return;
    }

    this.loadProducts(merchantSlug, { reset: true, query: '' });
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

  private mergeOffers(
    current: StoreOffer[],
    incoming: StoreOffer[],
  ): StoreOffer[] {
    if (current.length === 0) {
      return incoming;
    }

    const existingIds = new Set(current.map((offer) => offer.id));
    const next = [...current];
    for (const offer of incoming) {
      if (!existingIds.has(offer.id)) {
        next.push(offer);
      }
    }

    return next;
  }

  private disconnectObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }
}
