import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantProfile,
  UpdateMerchantProfilePayload,
} from '../models/merchant-shop.model';

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
}
