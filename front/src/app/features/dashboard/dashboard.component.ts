import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { extractApiErrorCode } from '../../core/errors/api-error.util';
import { OrderListItem, PaginatedOrders } from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { MerchantShopService } from '../../core/services/merchant-shop.service';
import { OrdersService } from '../../core/services/orders.service';
import { UiFeedbackService } from '../../core/services/ui-feedback.service';
import { ConfirmationDialogComponent } from '../../shared/dialogs/confirmation-dialog/confirmation-dialog.component';

const CUSTOMER_CANCEL_CONTACT_MERCHANT_CODES = new Set([
  'ORDER_CANCELLATION_NOT_ALLOWED_STATUS',
  'ORDER_CANCELLATION_PICKUP_STARTED',
  'ORDER_CANCELLATION_DEADLINE_PASSED',
]);

@Component({
  selector: 'app-dashboard',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DecimalPipe,
    TranslocoPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly merchantShopService = inject(MerchantShopService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly currentUser = this.authService.currentUser;
  readonly currentView = signal<'home' | 'orders'>('home');

  readonly loadingMerchants = signal(false);
  readonly merchantsErrorKey = signal<string | null>(null);
  readonly merchantSlugsLoading = signal<Record<string, boolean>>({});
  readonly merchants = signal<
    {
      id: string;
      slug: string;
      storeName: string;
      businessType: 'HANOUTE' | 'PATISSERIE';
      description: string | null;
      city: string | null;
      address: string | null;
    }[]
  >([]);

  readonly loadingOrders = signal(false);
  readonly ordersErrorKey = signal<string | null>(null);
  readonly orderActionErrorKey = signal<string | null>(null);
  readonly currentActionOrderId = signal<string | null>(null);
  readonly ordersPage = signal<PaginatedOrders | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');
  readonly isOrdersView = computed(() => this.currentView() === 'orders');
  readonly isHomeView = computed(() => this.currentView() === 'home');

  constructor() {
    effect(() => {
      const currentError =
        this.ordersErrorKey() ??
        this.orderActionErrorKey() ??
        this.merchantsErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });

    const routePath = this.route.snapshot.routeConfig?.path;
    this.currentView.set(routePath === 'dashboard/orders' ? 'orders' : 'home');

    if (this.isCustomer()) {
      if (this.isOrdersView()) {
        this.loadMyOrders();
      } else {
        this.loadMerchants();
      }
    }
  }

  loadMerchants(): void {
    if (!this.isCustomer()) {
      return;
    }

    this.loadingMerchants.set(true);
    this.merchantsErrorKey.set(null);

    this.merchantShopService.listPublicMerchants(1, 24).subscribe({
      next: (response) => {
        this.merchants.set(response.data);
        this.loadingMerchants.set(false);
      },
      error: () => {
        this.merchantsErrorKey.set('shell.dashboard.home.errors.loadFailed');
        this.loadingMerchants.set(false);
      },
    });
  }

  loadMyOrders(page = this.currentPage(), pageSize = this.pageSize()): void {
    if (!this.isCustomer()) {
      return;
    }

    this.loadingOrders.set(true);
    this.ordersErrorKey.set(null);
    this.orderActionErrorKey.set(null);

    this.ordersService.getMyOrders(page, pageSize).subscribe({
      next: (response) => {
        this.ordersPage.set(response);
        this.currentPage.set(response.page);
        this.pageSize.set(response.pageSize);
        this.loadingOrders.set(false);
      },
      error: () => {
        this.ordersErrorKey.set('shell.dashboard.orders.errors.loadFailed');
        this.loadingOrders.set(false);
      },
    });
  }

  onOrdersPageChange(event: PageEvent): void {
    this.loadMyOrders(event.pageIndex + 1, event.pageSize);
  }

  goToOrderDetail(orderId: string): void {
    this.router.navigate(['/detail-commande', orderId]);
  }

  goToMerchantShop(merchantSlug: string): void {
    const normalizedSlug = merchantSlug.trim();
    if (!normalizedSlug) {
      return;
    }

    this.merchantSlugsLoading.update((current) => ({
      ...current,
      [normalizedSlug]: true,
    }));
    this.router.navigate(['/shop', normalizedSlug]).finally(() => {
      this.merchantSlugsLoading.update((current) => {
        const { [normalizedSlug]: _, ...remaining } = current;
        return remaining;
      });
    });
  }

  isMerchantOpening(merchantSlug: string): boolean {
    return !!this.merchantSlugsLoading()[merchantSlug];
  }

  getMerchantAddress(
    city: string | null,
    address: string | null,
  ): string | null {
    const parts = [city, address]
      .map((value) => value?.trim())
      .filter((value): value is string => !!value);

    return parts.length > 0 ? parts.join(' - ') : null;
  }

  canCancelOrder(order: OrderListItem): boolean {
    return (
      order.status === 'PENDING' ||
      order.status === 'CONFIRMED' ||
      order.status === 'READY'
    );
  }

  cancelOrder(order: OrderListItem): void {
    if (order.status === 'CONFIRMED') {
      this.orderActionErrorKey.set(
        'shell.dashboard.orders.errors.contactMerchantForCancellation',
      );
      return;
    }

    if (order.status === 'READY') {
      this.orderActionErrorKey.set(
        'shell.dashboard.orders.errors.readyNoCancel',
      );
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'shell.dashboard.orders.cancelConfirmTitle',
        message: 'shell.dashboard.orders.cancelConfirmMessage',
        confirmLabel: 'shell.dashboard.orders.cancel',
        confirmColor: 'warn',
        icon: 'warning',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean | undefined) => {
      if (!confirmed) {
        return;
      }

      this.executeCancelOrder(order.id);
    });
  }

  private executeCancelOrder(orderId: string): void {
    this.currentActionOrderId.set(orderId);
    this.orderActionErrorKey.set(null);

    this.ordersService.cancelMyOrder(orderId).subscribe({
      next: () => {
        this.currentActionOrderId.set(null);
        this.loadMyOrders();
      },
      error: (error: unknown) => {
        const code = extractApiErrorCode(error);
        this.currentActionOrderId.set(null);
        this.orderActionErrorKey.set(
          code && CUSTOMER_CANCEL_CONTACT_MERCHANT_CODES.has(code)
            ? 'shell.dashboard.orders.errors.contactMerchantForCancellation'
            : 'shell.dashboard.orders.errors.cancelFailed',
        );
      },
    });
  }
}
