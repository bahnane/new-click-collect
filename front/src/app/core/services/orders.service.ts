import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Order } from '../models/order.model';

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

  getMyOrders(
    page = 1,
    pageSize = 10,
  ): Observable<{
    data: Order[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    return this.http.get<{
      data: Order[];
      total: number;
      page: number;
      pageSize: number;
    }>(`${environment.apiUrl}/orders/me`, {
      params: { page: String(page), pageSize: String(pageSize) },
      withCredentials: true,
    });
  }

  cancelMyOrder(orderId: string): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(
      `${environment.apiUrl}/orders/me/${encodeURIComponent(orderId)}/cancel`,
      {},
      {
        withCredentials: true,
      },
    );
  }
}
