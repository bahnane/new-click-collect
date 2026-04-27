import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../core/i18n/language.service';
import { Order } from '../../core/models/order.model';
import { OrdersService } from '../../core/services/orders.service';
import { resolvePostAuthMerchantSlug } from '../../core/utils/post-auth-redirect.util';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './order-confirmation.component.html',
  styleUrl: './order-confirmation.component.scss',
})
export class OrderConfirmationComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly languageService = inject(LanguageService);

  readonly loading = signal(true);
  readonly errorMessageKey = signal<string | null>(null);
  readonly order = signal<Order | null>(null);
  readonly currentDirection = this.languageService.currentDirection;

  readonly orderStatus = computed(() => this.order()?.status);

  ngOnInit(): void {
    this.loadOrderFromRoute();
  }

  private loadOrderFromRoute(): void {
    const orderId = this.route.snapshot.paramMap.get('id');
    if (!orderId) {
      this.errorMessageKey.set('order.confirmation.errors.notFound');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.errorMessageKey.set(null);

    this.ordersService.getMyOrderById(orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessageKey.set('order.confirmation.errors.loadFailed');
        this.loading.set(false);
      },
    });
  }

  getPickupSlotLabel(order: Order): string {
    const locale =
      this.languageService.currentLanguage() === 'ar' ? 'ar-DZ' : 'fr-FR';
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const startsAt = new Date(order.pickupStartsAt);
    const endsAt = new Date(order.pickupEndsAt);
    return `${formatter.format(startsAt)} - ${formatter.format(endsAt)}`;
  }

  getSaleUnit(unit: string): string {
    return `shop.saleUnit.${unit.toLowerCase()}`;
  }

  getPriceInDa(priceInCents: number): string {
    return (priceInCents / 100).toFixed(2);
  }

  getOrderStatusKey(status: string): string {
    return `order.status.${status.toLowerCase()}`;
  }

  goToDashboard(): void {
    const merchantSlug = resolvePostAuthMerchantSlug();
    if (merchantSlug) {
      this.router.navigate(['/shop', merchantSlug]);
      return;
    }

    this.router.navigate(['/dashboard']);
  }

  goToMyOrders(): void {
    this.router.navigate(['/dashboard'], { fragment: 'my-orders' });
  }

  retry(): void {
    this.loadOrderFromRoute();
  }
}
