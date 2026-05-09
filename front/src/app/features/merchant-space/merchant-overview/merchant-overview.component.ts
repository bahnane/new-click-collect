import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  MerchantOrderListItem,
  OrderStatus,
  PaginatedMerchantOrders,
} from '../../../core/models/order.model';
import { OrdersService } from '../../../core/services/orders.service';
import { UiFeedbackService } from '../../../core/services/ui-feedback.service';

type MerchantOrderFilter = OrderStatus | 'ALL';

interface MerchantStatusFilterOption {
  value: MerchantOrderFilter;
  labelKey: string;
}

const STATUS_FILTERS: MerchantStatusFilterOption[] = [
  { value: 'ALL', labelKey: 'shell.merchant.overview.filters.all' },
  { value: 'PENDING', labelKey: 'order.status.pending' },
  { value: 'CONFIRMED', labelKey: 'order.status.confirmed' },
  { value: 'READY', labelKey: 'order.status.ready' },
  { value: 'COLLECTED', labelKey: 'order.status.collected' },
  { value: 'CANCELLED', labelKey: 'order.status.cancelled' },
];

@Component({
  selector: 'app-merchant-overview',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    DatePipe,
    DecimalPipe,
    TranslocoPipe,
  ],
  templateUrl: './merchant-overview.component.html',
  styleUrl: './merchant-overview.component.scss',
})
export class MerchantOverviewComponent {
  private readonly ordersService = inject(OrdersService);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly loading = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly actionErrorKey = signal<string | null>(null);
  readonly currentActionOrderId = signal<string | null>(null);
  readonly ordersPage = signal<PaginatedMerchantOrders | null>(null);
  readonly statusFilter = signal<MerchantOrderFilter>('ALL');
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly statusFilters = STATUS_FILTERS;

  readonly actionableCount = computed(
    () =>
      this.ordersPage()?.data.filter((order) =>
        ['PENDING', 'CONFIRMED', 'READY'].includes(order.status),
      ).length ?? 0,
  );

  constructor() {
    effect(() => {
      const currentError = this.errorKey() ?? this.actionErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });
    this.loadOrders();
  }

  loadOrders(
    filter = this.statusFilter(),
    page = this.currentPage(),
    pageSize = this.pageSize(),
  ): void {
    this.loading.set(true);
    this.errorKey.set(null);

    this.ordersService
      .getMerchantOrders(filter === 'ALL' ? undefined : filter, page, pageSize)
      .subscribe({
        next: (response) => {
          this.ordersPage.set(response);
          this.currentPage.set(response.page);
          this.pageSize.set(response.pageSize);
          this.loading.set(false);
        },
        error: () => {
          this.errorKey.set('shell.merchant.overview.errors.loadFailed');
          this.loading.set(false);
        },
      });
  }

  setFilter(filter: MerchantOrderFilter): void {
    if (this.statusFilter() === filter) {
      return;
    }

    this.statusFilter.set(filter);
    this.currentPage.set(1);
    this.loadOrders(filter, 1, this.pageSize());
  }

  onPageChange(event: PageEvent): void {
    this.loadOrders(this.statusFilter(), event.pageIndex + 1, event.pageSize);
  }

  updateOrderStatus(orderId: string, nextStatus: OrderStatus): void {
    this.currentActionOrderId.set(orderId);
    this.actionErrorKey.set(null);

    this.ordersService
      .updateMerchantOrderStatus(orderId, nextStatus)
      .subscribe({
        next: () => {
          this.currentActionOrderId.set(null);
          this.loadOrders();
        },
        error: () => {
          this.currentActionOrderId.set(null);
          this.actionErrorKey.set(
            'shell.merchant.overview.errors.updateFailed',
          );
        },
      });
  }

  availableTransitions(status: OrderStatus): OrderStatus[] {
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

  trackByOrderId(_: number, order: MerchantOrderListItem): string {
    return order.id;
  }
}
