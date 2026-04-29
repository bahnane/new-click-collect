export type Weekday =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export interface MerchantProfile {
  id: string;
  slug: string;
  storeName: string;
  businessType: 'HANOUTE' | 'PATISSERIE';
  description: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  isActive: boolean;
  openingHours: MerchantHours[];
  pickupHours: MerchantHours[];
}

export interface UpdateMerchantProfilePayload {
  storeName?: string;
  description?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  openingHours?: MerchantHours[];
  pickupHours?: MerchantHours[];
}

export interface MerchantShopInfo {
  id: string;
  storeName: string;
  businessType: 'HANOUTE' | 'PATISSERIE';
  description: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  zipCode: string | null;
  isActive: boolean;
  openingHours: MerchantHours[];
  pickupHours: MerchantHours[];
}

export interface MerchantHours {
  dayOfWeek:
    | 'SUNDAY'
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY';
  startHour: number;
  endHour: number;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  saleUnit: 'KG' | 'G' | 'LITER' | 'UNIT' | 'PORTION';
  priceInCents: number | null;
  category: ProductCategory;
}

export interface StoreOffer {
  id: string;
  merchantId: string;
  productId: string;
  priceInCents: number | null;
  minOrderQty: number;
  stepQty: number;
  isActive: boolean;
  product: Product;
  defaultPriceInCents: number | null;
  overridePriceInCents: number | null;
  effectivePriceInCents: number | null;
  isOverridden: boolean;
}

export interface StoreOffersPaginatedResponse {
  data: StoreOffer[];
  total: number;
  page: number;
  pageSize: number;
}
