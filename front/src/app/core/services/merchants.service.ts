import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  MerchantProfile,
  ProductCategory,
  Product,
  UpdateMerchantProfilePayload,
  StoreOffersPaginatedResponse,
  StoreOffer,
  AdminMerchantsPaginatedResponse,
  CreateMerchantInvitePayload,
  MerchantInviteResponse,
} from '../models/merchant-shop.model';

export type ProductSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ProductSubmission {
  id: string;
  name: string;
  description: string | null;
  saleUnit: Product['saleUnit'];
  priceInCents: number | null;
  status: ProductSubmissionStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: ProductCategory;
  approvedProduct: Pick<Product, 'id' | 'name'> | null;
}

export interface ProductSubmissionsPaginatedResponse {
  data: ProductSubmission[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateProductSubmissionPayload {
  name: string;
  description?: string;
  saleUnit: Product['saleUnit'];
  priceInCents?: number;
  categoryId: string;
}

export interface UpdateProductSubmissionPayload {
  name?: string;
  description?: string;
  saleUnit?: Product['saleUnit'];
  priceInCents?: number | null;
  categoryId?: string;
}

export interface SimilarCatalogProduct {
  id: string;
  name: string;
  saleUnit: Product['saleUnit'];
  priceInCents: number | null;
  category: ProductCategory;
}

export interface UpdateStoreOfferPayload {
  priceInCents?: number | null;
  minOrderQty?: number;
  stepQty?: number;
}

export interface CreateStoreOfferPayload {
  productId: string;
  priceInCents?: number;
  minOrderQty?: number;
  stepQty?: number;
}

export interface CreateStoreOffersBatchResponse {
  count: number;
  data: StoreOffer[];
}

export interface CatalogProductsPaginatedResponse {
  data: Product[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminProductCategory {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  _count?: {
    products: number;
  };
}

export interface AdminCatalogProduct {
  id: string;
  name: string;
  description: string | null;
  saleUnit: Product['saleUnit'];
  priceInCents: number | null;
  isActive: boolean;
  category: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
  _count: {
    storeOffers: number;
  };
}

export interface AdminCatalogProductsPaginatedResponse {
  data: AdminCatalogProduct[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateAdminCatalogProductPayload {
  name: string;
  description?: string;
  saleUnit: Product['saleUnit'];
  priceInCents?: number;
  categoryId: string;
}

export interface UpdateAdminCatalogProductPayload {
  name?: string;
  description?: string;
  saleUnit?: Product['saleUnit'];
  priceInCents?: number;
  categoryId?: string;
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
  getCatalogProducts(
    page: number = 1,
    pageSize: number = 50,
  ): Observable<CatalogProductsPaginatedResponse> {
    return this.http.get<CatalogProductsPaginatedResponse>(
      `${environment.apiUrl}/products`,
      {
        withCredentials: true,
        params: { page: page.toString(), pageSize: pageSize.toString() },
      },
    );
  }

  createOffer(payload: CreateStoreOfferPayload): Observable<StoreOffer> {
    return this.http.post<StoreOffer>(
      `${environment.apiUrl}/merchants/me/offers`,
      payload,
      { withCredentials: true },
    );
  }

  createOffersBatch(
    payloads: CreateStoreOfferPayload[],
  ): Observable<CreateStoreOffersBatchResponse> {
    return this.http.post<CreateStoreOffersBatchResponse>(
      `${environment.apiUrl}/merchants/me/offers/batch`,
      { offers: payloads },
      { withCredentials: true },
    );
  }

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

  getProductCategories(): Observable<ProductCategory[]> {
    return this.http.get<ProductCategory[]>(
      `${environment.apiUrl}/product-categories`,
      {
        withCredentials: true,
      },
    );
  }

  getMyProductSubmissions(
    page: number = 1,
    pageSize: number = 10,
    status?: ProductSubmissionStatus,
  ): Observable<ProductSubmissionsPaginatedResponse> {
    const params: Record<string, string> = {
      page: page.toString(),
      pageSize: pageSize.toString(),
    };

    if (status) {
      params['status'] = status;
    }

    return this.http.get<ProductSubmissionsPaginatedResponse>(
      `${environment.apiUrl}/merchants/me/product-submissions`,
      {
        withCredentials: true,
        params,
      },
    );
  }

  createProductSubmission(
    payload: CreateProductSubmissionPayload,
  ): Observable<ProductSubmission> {
    return this.http.post<ProductSubmission>(
      `${environment.apiUrl}/products`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  updateProductSubmission(
    submissionId: string,
    payload: UpdateProductSubmissionPayload,
  ): Observable<ProductSubmission> {
    return this.http.patch<ProductSubmission>(
      `${environment.apiUrl}/merchants/me/product-submissions/${submissionId}`,
      payload,
      { withCredentials: true },
    );
  }

  deleteProductSubmission(
    submissionId: string,
  ): Observable<{ id: string; deleted: boolean }> {
    return this.http.delete<{ id: string; deleted: boolean }>(
      `${environment.apiUrl}/merchants/me/product-submissions/${submissionId}`,
      { withCredentials: true },
    );
  }

  searchSimilarCatalogProducts(
    label: string,
    limit: number = 5,
  ): Observable<SimilarCatalogProduct[]> {
    return this.http.get<SimilarCatalogProduct[]>(
      `${environment.apiUrl}/products/similar`,
      {
        withCredentials: true,
        params: {
          q: label,
          limit: limit.toString(),
        },
      },
    );
  }

  // ── Admin ────────────────────────────────────────────────────────────────

  listAdminMerchants(
    page = 1,
    pageSize = 10,
  ): Observable<AdminMerchantsPaginatedResponse> {
    return this.http.get<AdminMerchantsPaginatedResponse>(
      `${environment.apiUrl}/admin/merchants`,
      {
        withCredentials: true,
        params: { page: page.toString(), pageSize: pageSize.toString() },
      },
    );
  }

  createMerchantInvite(
    payload: CreateMerchantInvitePayload,
  ): Observable<MerchantInviteResponse> {
    return this.http.post<MerchantInviteResponse>(
      `${environment.apiUrl}/admin/merchants`,
      payload,
      { withCredentials: true },
    );
  }

  listAdminProductCategories(): Observable<AdminProductCategory[]> {
    return this.http.get<AdminProductCategory[]>(
      `${environment.apiUrl}/admin/product-categories`,
      {
        withCredentials: true,
      },
    );
  }

  listAdminCatalogProducts(
    page = 1,
    pageSize = 10,
  ): Observable<AdminCatalogProductsPaginatedResponse> {
    return this.http.get<AdminCatalogProductsPaginatedResponse>(
      `${environment.apiUrl}/admin/products`,
      {
        withCredentials: true,
        params: { page: page.toString(), pageSize: pageSize.toString() },
      },
    );
  }

  createAdminCatalogProduct(
    payload: CreateAdminCatalogProductPayload,
  ): Observable<AdminCatalogProduct> {
    return this.http.post<AdminCatalogProduct>(
      `${environment.apiUrl}/products`,
      payload,
      {
        withCredentials: true,
      },
    );
  }

  updateAdminCatalogProduct(
    productId: string,
    payload: UpdateAdminCatalogProductPayload,
  ): Observable<AdminCatalogProduct> {
    return this.http.patch<AdminCatalogProduct>(
      `${environment.apiUrl}/admin/products/${productId}`,
      payload,
      { withCredentials: true },
    );
  }

  toggleAdminCatalogProduct(
    productId: string,
  ): Observable<AdminCatalogProduct> {
    return this.http.patch<AdminCatalogProduct>(
      `${environment.apiUrl}/admin/products/${productId}/toggle`,
      {},
      { withCredentials: true },
    );
  }
}
