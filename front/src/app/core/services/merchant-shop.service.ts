import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantShopInfo,
  PublicStoreOffersCursorResponse,
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
    limit: number = 24,
    cursor?: string,
    query?: string,
  ): Observable<PublicStoreOffersCursorResponse> {
    const params: Record<string, string> = {
      limit: limit.toString(),
    };

    if (cursor) {
      params['cursor'] = cursor;
    }

    const normalizedQuery = query?.trim();
    if (normalizedQuery) {
      params['q'] = normalizedQuery;
    }

    return this.http.get<PublicStoreOffersCursorResponse>(
      `${environment.apiUrl}/merchants/${merchantSlug}/products`,
      {
        params,
      },
    );
  }
}
