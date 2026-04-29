import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantProfile,
  UpdateMerchantProfilePayload,
  StoreOffersPaginatedResponse,
  StoreOffer,
} from '../models/merchant-shop.model';

export interface UpdateStoreOfferPayload {
  priceInCents?: number | null;
  minOrderQty?: number;
  stepQty?: number;
}

@Injectable({ providedIn: 'root' })
export class MerchantsService {
  private readonly http = inject(HttpClient);

  getMyProfile(): Observable<MerchantProfile> {
    return this.http.get<MerchantProfile>(
      `${environment.apiUrl}/merchants/me`,
      {
        withCredentials: true,
      },
    );
  }

  updateMyProfile(
    payload: UpdateMerchantProfilePayload,
  ): Observable<MerchantProfile> {
    return this.http.patch<MerchantProfile>(
      `${environment.apiUrl}/merchants/me`,
      payload,
      { withCredentials: true },
    );
  }

  // Store offers
  getMyOffers(
    page: number = 1,
    pageSize: number = 10,
  ): Observable<StoreOffersPaginatedResponse> {
    return this.http.get<StoreOffersPaginatedResponse>(
      `${environment.apiUrl}/merchants/me/offers`,
      {
        withCredentials: true,
        params: { page: page.toString(), pageSize: pageSize.toString() },
      },
    );
  }

  updateOffer(
    offerId: string,
    payload: UpdateStoreOfferPayload,
  ): Observable<StoreOffer> {
    return this.http.patch<StoreOffer>(
      `${environment.apiUrl}/merchants/me/offers/${offerId}`,
      payload,
      { withCredentials: true },
    );
  }

  toggleOffer(offerId: string): Observable<StoreOffer> {
    return this.http.patch<StoreOffer>(
      `${environment.apiUrl}/merchants/me/offers/${offerId}/toggle`,
      {},
      { withCredentials: true },
    );
  }
}
