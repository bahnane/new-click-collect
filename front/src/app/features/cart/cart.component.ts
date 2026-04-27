import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../core/errors/api-error.util';
import { LanguageService } from '../../core/i18n/language.service';
import { CartItem, CartResponse } from '../../core/models/cart.model';
import {
  CartService,
  PublicPickupSlot,
} from '../../core/services/cart.service';
import { resolvePostAuthMerchantSlug } from '../../core/utils/post-auth-redirect.util';

const CHECKOUT_ERROR_KEY_BY_CODE: Record<string, string> = {
  BAD_REQUEST: 'cart.checkout.errors.invalidRequest',
  RESOURCE_NOT_FOUND: 'cart.checkout.errors.slotNotFound',
  CONFLICT: 'cart.checkout.errors.slotUnavailable',
  AUTH_UNAUTHORIZED: 'auth.apiErrors.AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN: 'auth.apiErrors.AUTH_FORBIDDEN',
};

@Component({
  selector: 'app-cart',
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
  private readonly fb = inject(FormBuilder);
  private readonly cartService = inject(CartService);
  private readonly router = inject(Router);
  protected readonly languageService = inject(LanguageService);

  readonly loading = signal(true);
  readonly loadingSlots = signal(false);
  readonly removingItemId = signal<string | null>(null);
  readonly updatingItemId = signal<string | null>(null);
  readonly checkoutLoading = signal(false);
  readonly errorMessageKey = signal<string | null>(null);
  readonly slotsErrorMessageKey = signal<string | null>(null);
  readonly checkoutErrorMessageKey = signal<string | null>(null);
  readonly checkoutSuccessMessageKey = signal<string | null>(null);
  readonly cart = signal<CartResponse | null>(null);
  readonly pickupSlots = signal<PublicPickupSlot[]>([]);

  readonly hasItems = computed(() => (this.cart()?.items.length ?? 0) > 0);
  readonly currentDirection = this.languageService.currentDirection;

  readonly checkoutForm = this.fb.nonNullable.group({
    pickupSlotId: ['', [Validators.required]],
    note: ['', [Validators.maxLength(1000)]],
  });

  ngOnInit(): void {
    this.checkoutForm.controls.pickupSlotId.disable({ emitEvent: false });
    this.loadCart();
  }

  loadCart(): void {
    this.loading.set(true);
    this.errorMessageKey.set(null);

    this.cartService.getMyCart().subscribe({
      next: (response) => {
        this.applyCartResponse(response);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessageKey.set('cart.errors.loadFailed');
        this.loading.set(false);
      },
    });
  }

  removeItem(itemId: string): void {
    if (
      this.removingItemId() ||
      this.updatingItemId() ||
      this.checkoutLoading()
    ) {
      return;
    }

    this.errorMessageKey.set(null);
    this.removingItemId.set(itemId);

    this.cartService.removeMyCartItem(itemId).subscribe({
      next: (response) => {
        this.applyCartResponse(response);
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
    if (
      this.updatingItemId() ||
      this.removingItemId() ||
      this.checkoutLoading()
    ) {
      return;
    }

    const nextQuantity = Math.max(1, item.quantity - 1);
    if (nextQuantity === item.quantity) {
      return;
    }

    this.updateItemQuantity(item, nextQuantity);
  }

  increaseItemQuantity(item: CartItem): void {
    if (
      this.updatingItemId() ||
      this.removingItemId() ||
      this.checkoutLoading()
    ) {
      return;
    }

    this.updateItemQuantity(item, item.quantity + 1);
  }

  getSaleUnit(unit: CartItem['product']['saleUnit']): string {
    return `shop.saleUnit.${unit.toLowerCase()}`;
  }

  getPickupSlotLabel(slot: PublicPickupSlot): string {
    const locale =
      this.languageService.currentLanguage() === 'ar' ? 'ar-DZ' : 'fr-FR';
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const startsAt = new Date(slot.startsAt);
    const endsAt = new Date(slot.endsAt);
    return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
  }

  submitCheckout(): void {
    if (
      this.checkoutLoading() ||
      this.updatingItemId() ||
      this.removingItemId() ||
      this.loadingSlots()
    ) {
      return;
    }

    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      this.checkoutErrorMessageKey.set('cart.checkout.errors.slotRequired');
      return;
    }

    const pickupSlotId = this.checkoutForm.controls.pickupSlotId.value;
    if (!pickupSlotId) {
      this.checkoutErrorMessageKey.set('cart.checkout.errors.slotRequired');
      return;
    }

    this.checkoutErrorMessageKey.set(null);
    this.checkoutSuccessMessageKey.set(null);
    this.checkoutLoading.set(true);
    this.syncPickupSlotControlState();

    this.cartService
      .checkoutOrder(pickupSlotId, this.checkoutForm.controls.note.value)
      .subscribe({
        next: (order) => {
          this.checkoutLoading.set(false);
          this.syncPickupSlotControlState();
          this.router.navigate(['/order-confirmation', order.id]);
        },
        error: (error: unknown) => {
          this.checkoutLoading.set(false);
          this.syncPickupSlotControlState();
          this.checkoutErrorMessageKey.set(
            this.resolveCheckoutErrorMessageKey(error),
          );
        },
      });
  }

  private updateItemQuantity(item: CartItem, quantity: number): void {
    this.errorMessageKey.set(null);
    this.updatingItemId.set(item.id);

    this.cartService.upsertMyCartItem(item.storeOfferId, quantity).subscribe({
      next: (response) => {
        this.applyCartResponse(response);
        this.updatingItemId.set(null);
      },
      error: () => {
        this.errorMessageKey.set('cart.errors.updateFailed');
        this.updatingItemId.set(null);
      },
    });
  }

  private applyCartResponse(response: CartResponse): void {
    this.cart.set(response);
    const merchantId = response.merchantId;
    const hasItems = response.items.length > 0;

    if (!merchantId || !hasItems) {
      this.pickupSlots.set([]);
      this.slotsErrorMessageKey.set(null);
      this.checkoutForm.controls.pickupSlotId.setValue('');
      this.syncPickupSlotControlState();
      return;
    }

    this.loadPickupSlots(merchantId);
  }

  private loadPickupSlots(merchantId: string): void {
    this.loadingSlots.set(true);
    this.slotsErrorMessageKey.set(null);
    this.syncPickupSlotControlState();

    this.cartService.listPublicPickupSlots(merchantId).subscribe({
      next: (slots) => {
        this.pickupSlots.set(slots);
        const selected = this.checkoutForm.controls.pickupSlotId.value;
        const exists = slots.some((slot) => slot.id === selected);
        this.checkoutForm.controls.pickupSlotId.setValue(
          exists ? selected : (slots[0]?.id ?? ''),
        );
        this.loadingSlots.set(false);
        this.syncPickupSlotControlState();
      },
      error: () => {
        this.pickupSlots.set([]);
        this.checkoutForm.controls.pickupSlotId.setValue('');
        this.slotsErrorMessageKey.set('cart.checkout.errors.loadSlotsFailed');
        this.loadingSlots.set(false);
        this.syncPickupSlotControlState();
      },
    });
  }

  private syncPickupSlotControlState(): void {
    const pickupSlotControl = this.checkoutForm.controls.pickupSlotId;
    const shouldDisable =
      this.loadingSlots() ||
      this.checkoutLoading() ||
      this.pickupSlots().length === 0;

    if (shouldDisable) {
      pickupSlotControl.disable({ emitEvent: false });
      return;
    }

    pickupSlotControl.enable({ emitEvent: false });
  }

  private resolveCheckoutErrorMessageKey(error: unknown): string {
    const code = extractApiErrorCode(error);
    if (code) {
      return CHECKOUT_ERROR_KEY_BY_CODE[code] ?? 'cart.checkout.errors.generic';
    }

    return 'cart.checkout.errors.generic';
  }
}
