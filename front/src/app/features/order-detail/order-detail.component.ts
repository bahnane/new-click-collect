import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import {
  MerchantOrder,
  Order,
  OrderStatus,
} from '../../core/models/order.model';
import { OrdersService } from '../../core/services/orders.service';
import { UiFeedbackService } from '../../core/services/ui-feedback.service';

type OrderDetailViewMode = 'customer' | 'merchant';
type OrderDetailData = Order | MerchantOrder;

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoPipe,
  ],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.scss',
})
export class OrderDetailComponent implements OnInit {
  private readonly ordersService = inject(OrdersService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly uiFeedback = inject(UiFeedbackService);
  protected readonly languageService = inject(LanguageService);

  readonly viewMode = signal<OrderDetailViewMode>('customer');
  readonly loading = signal(true);
  readonly errorMessageKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly actionInProgress = signal(false);
  readonly order = signal<OrderDetailData | null>(null);
  readonly currentDirection = this.languageService.currentDirection;

  readonly orderStatus = computed(() => this.order()?.status);
  readonly counterpartLabelKey = computed(() =>
    this.viewMode() === 'merchant'
      ? 'order.detail.customer'
      : 'order.confirmation.merchant',
  );
  readonly backButtonLabelKey = computed(() =>
    this.viewMode() === 'merchant'
      ? 'order.detail.backToMerchantOrders'
      : 'order.detail.backToOrders',
  );
  readonly customerCanCancel = computed(
    () => this.viewMode() === 'customer' && this.order()?.status === 'PENDING',
  );
  readonly merchantAvailableTransitions = computed(() => {
    if (this.viewMode() !== 'merchant') {
      return [] as OrderStatus[];
    }

    return this.availableMerchantTransitions(this.order()?.status);
  });

  constructor() {
    effect(() => {
      const currentError = this.errorMessageKey() ?? this.actionErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
  }

  ngOnInit(): void {
    this.viewMode.set(this.resolveViewMode());
    this.loadOrderFromRoute();
  }

  private loadOrderFromRoute(): void {
    const orderId = this.route.snapshot.paramMap.get('id');
    if (!orderId) {
      this.errorMessageKey.set('order.detail.errors.notFound');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.errorMessageKey.set(null);
    this.actionErrorKey.set(null);

    this.getOrderRequest(orderId).subscribe({
      next: (order) => {
        this.order.set(order);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessageKey.set('order.detail.errors.loadFailed');
        this.loading.set(false);
      },
    });
  }

  getPickupSlotLabel(order: OrderDetailData): string {
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

  getCounterpartValue(order: OrderDetailData): string | null {
    if (this.isMerchantOrder(order)) {
      return order.customer.email || null;
    }

    return order.merchant.storeName || null;
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

  actionLabelKey(status: OrderStatus): string {
    switch (status) {
      case 'CONFIRMED':
        return 'shell.merchant.overview.actions.confirm';
      case 'READY':
        return 'shell.merchant.overview.actions.ready';
      case 'COLLECTED':
        return 'shell.merchant.overview.actions.collected';
      case 'CANCELLED':
        return 'shell.merchant.overview.actions.cancel';
      default:
        return 'shell.merchant.overview.actions.update';
    }
  }

  goToMyOrders(): void {
    if (this.viewMode() === 'merchant') {
      this.router.navigate(['/merchant/overview']);
      return;
    }

    this.router.navigate(['/dashboard'], { fragment: 'my-orders' });
  }

  retry(): void {
    this.loadOrderFromRoute();
  }

  updateMerchantOrderStatus(nextStatus: OrderStatus): void {
    const currentOrder = this.order();
    if (!currentOrder || this.viewMode() !== 'merchant') {
      return;
    }

    this.actionInProgress.set(true);
    this.actionErrorKey.set(null);

    this.ordersService
      .updateMerchantOrderStatus(currentOrder.id, nextStatus)
      .subscribe({
        next: (updatedOrder) => {
          this.order.set(updatedOrder);
          this.actionInProgress.set(false);
        },
        error: () => {
          this.actionErrorKey.set('order.detail.errors.updateFailed');
          this.actionInProgress.set(false);
        },
      });
  }

  cancelCustomerOrder(): void {
    const currentOrder = this.order();
    if (
      !currentOrder ||
      this.viewMode() !== 'customer' ||
      currentOrder.status !== 'PENDING'
    ) {
      return;
    }

    this.actionInProgress.set(true);
    this.actionErrorKey.set(null);

    this.ordersService.cancelMyOrder(currentOrder.id).subscribe({
      next: (updatedOrder) => {
        this.order.set(updatedOrder);
        this.actionInProgress.set(false);
      },
      error: () => {
        this.actionErrorKey.set('order.detail.errors.cancelFailed');
        this.actionInProgress.set(false);
      },
    });
  }

  private getOrderRequest(orderId: string): Observable<OrderDetailData> {
    return this.viewMode() === 'merchant'
      ? this.ordersService.getMerchantOrderById(orderId)
      : this.ordersService.getMyOrderById(orderId);
  }

  private resolveViewMode(): OrderDetailViewMode {
    return this.route.snapshot.data['orderView'] === 'merchant'
      ? 'merchant'
      : 'customer';
  }

  private availableMerchantTransitions(
    status: OrderStatus | undefined,
  ): OrderStatus[] {
    switch (status) {
      case 'PENDING':
        return ['CONFIRMED', 'CANCELLED'];
      case 'CONFIRMED':
        return ['READY', 'CANCELLED'];
      case 'READY':
        return ['COLLECTED'];
      default:
        return [];
    }
  }

  private isMerchantOrder(order: OrderDetailData): order is MerchantOrder {
    return 'customer' in order;
  }
}
