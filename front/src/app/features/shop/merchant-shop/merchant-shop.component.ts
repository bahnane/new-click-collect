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
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
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
import { ShopShellContextService } from '../../../core/services/shop-shell-context.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';
import {
  MerchantShopInfo,
  PublicStoreOffersCursorResponse,
  Product,
  StoreOffer,
} from '../../../core/models/merchant-shop.model';

interface SubCategoryGroup {
  id: string;
  name: string;
  offers: StoreOffer[];
}

interface RootCategoryGroup {
  id: string;
  slug: string;
  name: string;
  offers: StoreOffer[];
  subCategories: SubCategoryGroup[];
}

@Component({
  selector: 'app-merchant-shop',
  standalone: true,
  imports: [
    CommonModule,
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
  private readonly shopShellContext = inject(ShopShellContextService);
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
  readonly addingOfferId = signal<string | null>(null);
  readonly activeSearchQuery = signal(
    this.shopShellContext.searchValue().trim(),
  );
  readonly selectedRootCategoryId = signal<string | null>(null);
  readonly selectedSubCategoryId = signal<string>('all');
  readonly requestedRootCategory = signal<string | null>(null);
  readonly categoryBarsVisible = signal(true);
  readonly merchantSlug = signal('');
  readonly isAuthenticated = this.authService.isAuthenticated;

  private queryParamsSubscription: Subscription | null = null;
  private readonly searchDebounceMs = 350;
  private productsRequestSeq = 0;
  private autoLoadedBatchCount = 0;
  private previousScrollY = 0;
  private rootCategoriesRowElement: HTMLElement | null = null;
  private subCategoriesRowElement: HTMLElement | null = null;

  private readonly onWindowScroll = (): void => {
    this.handleWindowScroll();
  };

  readonly isRtl = this.languageService.isRtl;
  readonly currentDirection = this.languageService.currentDirection;

  readonly rootCategoryGroups = computed<RootCategoryGroup[]>(() => {
    const groups = new Map<
      string,
      {
        id: string;
        slug: string;
        name: string;
        offers: StoreOffer[];
        subCategoriesMap: Map<string, SubCategoryGroup>;
      }
    >();

    for (const offer of this.offers()) {
      const rootCategory = offer.product.category;
      const rootEntry = groups.get(rootCategory.id) ?? {
        id: rootCategory.id,
        slug: rootCategory.slug,
        name: rootCategory.name,
        offers: [],
        subCategoriesMap: new Map<string, SubCategoryGroup>(),
      };

      rootEntry.offers.push(offer);

      const subCategory = offer.product.subCategory;
      if (subCategory) {
        const subEntry = rootEntry.subCategoriesMap.get(subCategory.id) ?? {
          id: subCategory.id,
          name: subCategory.name,
          offers: [],
        };
        subEntry.offers.push(offer);
        rootEntry.subCategoriesMap.set(subCategory.id, subEntry);
      }

      groups.set(rootCategory.id, rootEntry);
    }

    return Array.from(groups.values()).map((entry) => ({
      id: entry.id,
      slug: entry.slug,
      name: entry.name,
      offers: entry.offers,
      subCategories: Array.from(entry.subCategoriesMap.values()),
    }));
  });

  readonly activeRootCategory = computed<RootCategoryGroup | null>(() => {
    const selectedRootCategoryId = this.selectedRootCategoryId();
    if (!selectedRootCategoryId) {
      return this.rootCategoryGroups()[0] ?? null;
    }

    return (
      this.rootCategoryGroups().find(
        (category) => category.id === selectedRootCategoryId,
      ) ?? null
    );
  });

  readonly filteredOffers = computed<StoreOffer[]>(() => {
    const activeRootCategory = this.activeRootCategory();
    if (!activeRootCategory) {
      return [];
    }

    const selectedSubCategoryId = this.selectedSubCategoryId();
    if (selectedSubCategoryId === 'all') {
      return activeRootCategory.offers;
    }

    return (
      activeRootCategory.subCategories.find(
        (subCategory) => subCategory.id === selectedSubCategoryId,
      )?.offers ?? []
    );
  });

  readonly activeSubCategoryName = computed<string | null>(() => {
    const selectedSubCategoryId = this.selectedSubCategoryId();
    if (selectedSubCategoryId === 'all') {
      return null;
    }

    return (
      this.activeRootCategory()?.subCategories.find(
        (subCategory) => subCategory.id === selectedSubCategoryId,
      )?.name ?? null
    );
  });

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
      const rootCategoryGroups = this.rootCategoryGroups();
      if (rootCategoryGroups.length === 0) {
        this.selectedRootCategoryId.set(null);
        this.selectedSubCategoryId.set('all');
        return;
      }

      const requestedRootCategory = this.requestedRootCategory();
      if (requestedRootCategory) {
        const normalizedRequestedRootCategory =
          requestedRootCategory.toLowerCase();
        const requestedCategory = rootCategoryGroups.find(
          (category) =>
            category.id === requestedRootCategory ||
            category.slug.toLowerCase() === normalizedRequestedRootCategory ||
            category.name.toLowerCase() === normalizedRequestedRootCategory,
        );

        if (requestedCategory) {
          this.selectedRootCategoryId.set(requestedCategory.id);
          this.selectedSubCategoryId.set('all');
          this.requestedRootCategory.set(null);
          return;
        }
      }

      const selectedRootCategoryId = this.selectedRootCategoryId();
      const hasSelectedRoot = rootCategoryGroups.some(
        (category) => category.id === selectedRootCategoryId,
      );
      if (!selectedRootCategoryId || !hasSelectedRoot) {
        this.selectedRootCategoryId.set(rootCategoryGroups[0]!.id);
        this.selectedSubCategoryId.set('all');
        return;
      }

      const activeRootCategory = rootCategoryGroups.find(
        (category) => category.id === selectedRootCategoryId,
      );
      if (!activeRootCategory) {
        return;
      }

      const selectedSubCategoryId = this.selectedSubCategoryId();
      const hasSelectedSubCategory =
        selectedSubCategoryId === 'all' ||
        activeRootCategory.subCategories.some(
          (subCategory) => subCategory.id === selectedSubCategoryId,
        );
      if (!hasSelectedSubCategory) {
        this.selectedSubCategoryId.set('all');
      }
    });

    effect((onCleanup) => {
      const rawValue = this.shopShellContext.searchValue();
      const timeoutHandle = setTimeout(() => {
        const normalized = rawValue.trim();
        if (normalized === this.activeSearchQuery()) {
          return;
        }

        this.activeSearchQuery.set(normalized);
        const merchantSlug = this.merchantSlug();
        if (!merchantSlug) {
          return;
        }

        this.loadProducts(merchantSlug, { reset: true, query: normalized });
      }, this.searchDebounceMs);

      onCleanup(() => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  ngOnInit(): void {
    const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
    if (!merchantSlug) {
      this.error.set('shop.merchantNotFound');
      this.loading.set(false);
      return;
    }

    this.merchantSlug.set(merchantSlug);

    this.queryParamsSubscription = this.route.queryParamMap.subscribe(
      (queryParams) => {
        const requestedRootCategory = queryParams.get('categorie')?.trim();
        this.requestedRootCategory.set(requestedRootCategory || null);
      },
    );

    this.loadMerchantAndProducts(merchantSlug);

    if (typeof window !== 'undefined') {
      this.previousScrollY = window.scrollY;
      window.addEventListener('scroll', this.onWindowScroll, { passive: true });
    }
  }

  ngOnDestroy(): void {
    this.queryParamsSubscription?.unsubscribe();
    this.queryParamsSubscription = null;

    this.disconnectObserver();

    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.onWindowScroll);
    }
  }

  @ViewChild('rootCategoriesRow')
  set rootCategoriesRow(element: ElementRef<HTMLElement> | undefined) {
    this.rootCategoriesRowElement = element?.nativeElement ?? null;
  }

  @ViewChild('subCategoriesRow')
  set subCategoriesRow(element: ElementRef<HTMLElement> | undefined) {
    this.subCategoriesRowElement = element?.nativeElement ?? null;
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
        this.shopShellContext.setShopIdentity(merchantSlug, info.storeName);
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

  selectRootCategory(rootCategoryId: string): void {
    if (this.selectedRootCategoryId() === rootCategoryId) {
      return;
    }

    this.selectedRootCategoryId.set(rootCategoryId);
    this.selectedSubCategoryId.set('all');
  }

  selectSubCategory(subCategoryId: string): void {
    this.selectedSubCategoryId.set(subCategoryId);
  }

  scrollCategoryRow(row: 'root' | 'sub', direction: 'previous' | 'next'): void {
    const element =
      row === 'root'
        ? this.rootCategoriesRowElement
        : this.subCategoriesRowElement;

    if (!element) {
      return;
    }

    const distance = 220;
    element.scrollBy({
      left: direction === 'previous' ? -distance : distance,
      behavior: 'smooth',
    });
  }

  isRootCategorySelected(rootCategoryId: string): boolean {
    return this.selectedRootCategoryId() === rootCategoryId;
  }

  isSubCategorySelected(subCategoryId: string): boolean {
    return this.selectedSubCategoryId() === subCategoryId;
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
    _maxOrderQty: number | null = null,
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
    maxOrderQty: number | null = null,
  ): void {
    const safeMinOrderQty = this.toPositiveNumber(minOrderQty, 1);
    const safeStepQty = this.toPositiveNumber(stepQty, 1);
    const current =
      this.resolveQuantity(input.value, safeMinOrderQty, safeStepQty) ??
      safeMinOrderQty;
    const next = current + safeStepQty;
    input.value = this.formatQuantity(
      maxOrderQty != null && maxOrderQty > 0
        ? Math.min(next, maxOrderQty)
        : next,
    );
  }

  addToCart(
    storeOfferId: string,
    minOrderQty: number,
    stepQty: number,
    quantityValue?: string,
    maxOrderQty: number | null = null,
  ): void {
    this.addToCartErrorKey.set(null);

    if (!this.isAuthenticated()) {
      const merchantSlug = this.route.snapshot.paramMap.get('merchantSlug');
      this.router.navigate(['/login'], {
        queryParams: merchantSlug ? { merchantSlug } : undefined,
      });
      return;
    }

    if (this.authService.currentUser()?.role !== 'CUSTOMER') {
      this.addToCartErrorKey.set('shop.requiresCustomerRole');
      return;
    }

    const safeQuantity = this.resolveQuantity(
      quantityValue,
      minOrderQty,
      stepQty,
      maxOrderQty,
    );
    if (safeQuantity == null) {
      this.addToCartErrorKey.set('shop.quantityInvalid');
      return;
    }

    this.addingOfferId.set(storeOfferId);
    this.cartService.upsertMyCartItem(storeOfferId, safeQuantity).subscribe({
      next: () => {
        this.addingOfferId.set(null);
      },
      error: (error: unknown) => {
        this.addingOfferId.set(null);
        this.addToCartErrorKey.set(this.resolveAddToCartErrorMessageKey(error));
      },
    });
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
    maxOrderQty: number | null = null,
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

    if (
      maxOrderQty != null &&
      maxOrderQty > 0 &&
      parsedQuantity > maxOrderQty
    ) {
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

  private handleWindowScroll(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const currentScrollY = window.scrollY;
    const delta = currentScrollY - this.previousScrollY;
    this.previousScrollY = currentScrollY;

    if (currentScrollY <= 0) {
      this.categoryBarsVisible.set(true);
      return;
    }

    if (delta === 0) {
      return;
    }

    this.categoryBarsVisible.set(delta < 0);
  }
}
