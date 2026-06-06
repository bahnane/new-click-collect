import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantShopInfo,
  PaginatedPublicMerchantsResponse,
  ProductCategory,
  PublicStoreOffersCursorResponse,
} from '../models/merchant-shop.model';

@Injectable({ providedIn: 'root' })
export class MerchantShopService {
  private readonly http = inject(HttpClient);

  listPublicMerchants(
    page: number = 1,
    pageSize: number = 12,
  ): Observable<PaginatedPublicMerchantsResponse> {
    return this.http.get<PaginatedPublicMerchantsResponse>(
      `${environment.apiUrl}/merchants`,
      {
        params: { page: page.toString(), pageSize: pageSize.toString() },
      },
    );
  }

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

  getMerchantRootCategories(
    merchantSlug: string,
  ): Observable<ProductCategory[]> {
    return this.http.get<ProductCategory[]>(
      `${environment.apiUrl}/merchants/${merchantSlug}/categories`,
    );
  }
}
