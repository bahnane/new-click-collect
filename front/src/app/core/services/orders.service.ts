import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantOrder,
  Order,
  OrderStatus,
  PaginatedMerchantOrders,
  PaginatedOrders,
} from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);

  getMyOrderById(orderId: string): Observable<Order> {
    return this.http.get<Order>(
      `${environment.apiUrl}/orders/me/${encodeURIComponent(orderId)}`,
      {
        withCredentials: true,
      },
    );
  }

  getMyOrders(page = 1, pageSize = 10): Observable<PaginatedOrders> {
    return this.http.get<PaginatedOrders>(`${environment.apiUrl}/orders/me`, {
      params: { page: String(page), pageSize: String(pageSize) },
      withCredentials: true,
    });
  }

  cancelMyOrder(orderId: string): Observable<Order> {
    return this.http.patch<Order>(
      `${environment.apiUrl}/orders/me/${encodeURIComponent(orderId)}/cancel`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  getMerchantOrders(
    status?: OrderStatus,
    page = 1,
    pageSize = 10,
  ): Observable<PaginatedMerchantOrders> {
    const params: Record<string, string> = {
      page: String(page),
      pageSize: String(pageSize),
    };

    if (status) {
      params['status'] = status;
    }

    return this.http.get<PaginatedMerchantOrders>(
      `${environment.apiUrl}/merchants/me/orders`,
      {
        params,
        withCredentials: true,
      },
    );
  }

  getMerchantOrderById(orderId: string): Observable<MerchantOrder> {
    return this.http.get<MerchantOrder>(
      `${environment.apiUrl}/merchants/me/orders/${encodeURIComponent(orderId)}`,
      {
        withCredentials: true,
      },
    );
  }

  updateMerchantOrderStatus(
    orderId: string,
    status: OrderStatus,
  ): Observable<MerchantOrder> {
    return this.http.patch<MerchantOrder>(
      `${environment.apiUrl}/merchants/me/orders/${encodeURIComponent(orderId)}/status`,
      { status },
      {
        withCredentials: true,
      },
    );
  }
}
