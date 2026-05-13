import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CartResponse } from '../models/cart.model';
import { Order } from '../models/order.model';

interface UpsertCartItemPayload {
  storeOfferId: string;
  quantity: number;
}

export interface PublicPickupSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  currentOrders: number;
}

interface CheckoutOrderPayload {
  pickupSlotId: string;
  note?: string;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);

  getMyCart(): Observable<CartResponse> {
    return this.http.get<CartResponse>(`${environment.apiUrl}/cart`, {
      withCredentials: true,
    });
  }

  upsertMyCartItem(
    storeOfferId: string,
    quantity: number,
  ): Observable<CartResponse> {
    const payload: UpsertCartItemPayload = {
      storeOfferId,
      quantity,
    };

    return this.http.post<CartResponse>(
      `${environment.apiUrl}/cart/items`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  removeMyCartItem(itemId: string): Observable<CartResponse> {
    return this.http.delete<CartResponse>(
      `${environment.apiUrl}/cart/items/${encodeURIComponent(itemId)}`,
      {
        withCredentials: true,
      },
    );
  }

  listPublicPickupSlots(merchantId: string): Observable<PublicPickupSlot[]> {
    return this.http.get<PublicPickupSlot[]>(
      `${environment.apiUrl}/merchants/${encodeURIComponent(merchantId)}/pickup-slots`,
      {
        withCredentials: true,
      },
    );
  }

  checkoutOrder(pickupSlotId: string, note?: string): Observable<Order> {
    const payload: CheckoutOrderPayload = {
      pickupSlotId,
      ...(note?.trim() ? { note: note.trim() } : {}),
    };

    return this.http.post<Order>(
      `${environment.apiUrl}/orders/checkout`,
      payload,
      {
        withCredentials: true,
      },
    );
  }
}
