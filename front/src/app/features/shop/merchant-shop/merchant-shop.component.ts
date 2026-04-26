import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { TranslocoPipe } from '@jsverse/transloco';
import { MerchantShopService } from '../../../core/services/merchant-shop.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AuthService } from '../../../core/services/auth.service';
import {
  MerchantShopInfo,
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  protected readonly languageService = inject(LanguageService);

  readonly merchantInfo = signal<MerchantShopInfo | null>(null);
  readonly products = signal<StoreOffersPaginatedResponse | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly currentPage = signal(1);
  readonly currentUser = this.authService.currentUser;
  readonly isAuthenticated = this.authService.isAuthenticated;

  readonly isMerchant = computed(() => this.currentUser()?.role === 'MERCHANT');
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');

  readonly businessTypeLabel = computed(() => {
    const type = this.merchantInfo()?.businessType;
    return type ? `shop.businessType.${type.toLowerCase()}` : '';
  });

  readonly isRtl = this.languageService.isRtl;
  readonly currentDirection = this.languageService.currentDirection;

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
}
