import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantShopInfo,
  StoreOffersPaginatedResponse,
} from '../models/merchant-shop.model';

@Injectable({ providedIn: 'root' })
export class MerchantShopService {
  private readonly http = inject(HttpClient);

  getMerchantInfo(merchantSlug: string): Observable<MerchantShopInfo> {
    return this.http.get<MerchantShopInfo>(
      `${environment.apiUrl}/merchants/${merchantSlug}`,
    );
  }

  getMerchantProducts(
    merchantSlug: string,
    page: number = 1,
    pageSize: number = 24,
    query?: string,
  ): Observable<StoreOffersPaginatedResponse> {
    const params: Record<string, string> = {
      page: page.toString(),
      pageSize: pageSize.toString(),
    };

    const normalizedQuery = query?.trim();
    if (normalizedQuery) {
      params['q'] = normalizedQuery;
    }

    return this.http.get<StoreOffersPaginatedResponse>(
      `${environment.apiUrl}/merchants/${merchantSlug}/products`,
      {
        params,
      },
    );
  }
}
