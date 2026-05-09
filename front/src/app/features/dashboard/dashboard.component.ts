import { DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoPipe } from '@jsverse/transloco';
import { OrderListItem, PaginatedOrders } from '../../core/models/order.model';
import { AuthService } from '../../core/services/auth.service';
import { OrdersService } from '../../core/services/orders.service';
import { UiFeedbackService } from '../../core/services/ui-feedback.service';

@Component({
  selector: 'app-dashboard',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    DecimalPipe,
    TranslocoPipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly ordersService = inject(OrdersService);
  private readonly router = inject(Router);
  private readonly uiFeedback = inject(UiFeedbackService);

  readonly currentUser = this.authService.currentUser;

  readonly loadingOrders = signal(false);
  readonly ordersErrorKey = signal<string | null>(null);
  readonly orderActionErrorKey = signal<string | null>(null);
  readonly currentActionOrderId = signal<string | null>(null);
  readonly ordersPage = signal<PaginatedOrders | null>(null);
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');

  constructor() {
    effect(() => {
      const currentError = this.ordersErrorKey() ?? this.orderActionErrorKey();
      if (currentError) {
        this.uiFeedback.showError(currentError);
      } else {
        this.uiFeedback.clearError();
      }
    });

    if (this.isCustomer()) {
      this.loadMyOrders();
    }
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

  canCancelOrder(order: OrderListItem): boolean {
    return order.status === 'PENDING';
  }

  cancelOrder(orderId: string): void {
    this.currentActionOrderId.set(orderId);
    this.orderActionErrorKey.set(null);

    this.ordersService.cancelMyOrder(orderId).subscribe({
      next: () => {
        this.currentActionOrderId.set(null);
        this.loadMyOrders();
      },
      error: () => {
        this.currentActionOrderId.set(null);
        this.orderActionErrorKey.set(
          'shell.dashboard.orders.errors.cancelFailed',
        );
      },
    });
  }
}
