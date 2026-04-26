import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { CartItem, CartResponse } from '../../core/models/cart.model';
import { CartService } from '../../core/services/cart.service';
import { resolvePostAuthMerchantSlug } from '../../core/utils/post-auth-redirect.util';

@Component({
  selector: 'app-cart',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.scss',
})
export class CartComponent implements OnInit {
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  protected readonly languageService = inject(LanguageService);

  readonly loading = signal(true);
  readonly removingItemId = signal<string | null>(null);
  readonly updatingItemId = signal<string | null>(null);
  readonly errorMessageKey = signal<string | null>(null);
  readonly cart = signal<CartResponse | null>(null);

  readonly hasItems = computed(() => (this.cart()?.items.length ?? 0) > 0);
  readonly currentDirection = this.languageService.currentDirection;

  ngOnInit(): void {
    this.loadCart();
  }

  loadCart(): void {
    this.loading.set(true);
    this.errorMessageKey.set(null);

    this.cartService.getMyCart().subscribe({
      next: (response) => {
        this.cart.set(response);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessageKey.set('cart.errors.loadFailed');
        this.loading.set(false);
      },
    });
  }

  removeItem(itemId: string): void {
    if (this.removingItemId() || this.updatingItemId()) {
      return;
    }

    this.errorMessageKey.set(null);
    this.removingItemId.set(itemId);

    this.cartService.removeMyCartItem(itemId).subscribe({
      next: (response) => {
        this.cart.set(response);
        this.removingItemId.set(null);
      },
      error: () => {
        this.errorMessageKey.set('cart.errors.removeFailed');
        this.removingItemId.set(null);
      },
    });
  }

  continueShopping(): void {
    const merchantSlug = resolvePostAuthMerchantSlug();
    if (merchantSlug) {
      this.router.navigate(['/shop', merchantSlug]);
      return;
    }

    this.router.navigate(['/dashboard']);
  }

  getPriceInDa(priceInCents: number): string {
    return (priceInCents / 100).toFixed(2);
  }

  decreaseItemQuantity(item: CartItem): void {
    if (this.updatingItemId() || this.removingItemId()) {
      return;
    }

    const nextQuantity = Math.max(1, item.quantity - 1);
    if (nextQuantity === item.quantity) {
      return;
    }

    this.updateItemQuantity(item, nextQuantity);
  }

  increaseItemQuantity(item: CartItem): void {
    if (this.updatingItemId() || this.removingItemId()) {
      return;
    }

    this.updateItemQuantity(item, item.quantity + 1);
  }

  getSaleUnit(unit: CartItem['product']['saleUnit']): string {
    return `shop.saleUnit.${unit.toLowerCase()}`;
  }

  private updateItemQuantity(item: CartItem, quantity: number): void {
    this.errorMessageKey.set(null);
    this.updatingItemId.set(item.id);

    this.cartService.upsertMyCartItem(item.storeOfferId, quantity).subscribe({
      next: (response) => {
        this.cart.set(response);
        this.updatingItemId.set(null);
      },
      error: () => {
        this.errorMessageKey.set('cart.errors.updateFailed');
        this.updatingItemId.set(null);
      },
    });
  }
}
