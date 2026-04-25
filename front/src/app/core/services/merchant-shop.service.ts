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

  getMerchantInfo(merchantId: string): Observable<MerchantShopInfo> {
    return this.http.get<MerchantShopInfo>(
      `${environment.apiUrl}/merchants/${merchantId}`,
    );
  }

  getMerchantProducts(
    merchantId: string,
    page: number = 1,
    pageSize: number = 24,
  ): Observable<StoreOffersPaginatedResponse> {
    return this.http.get<StoreOffersPaginatedResponse>(
      `${environment.apiUrl}/merchants/${merchantId}/products`,
      {
        params: { page: page.toString(), pageSize: pageSize.toString() },
      },
    );
  }
}
