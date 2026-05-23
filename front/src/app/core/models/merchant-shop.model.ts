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
  pickupSlotCapacity: number;
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
  pickupSlotCapacity?: number;
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
  parentId?: string | null;
  name: string;
  slug: string;
  isActive?: boolean;
  imageAsset?: ImageAsset | null;
}

export interface ImageAssetVariant {
  variantKey: string;
  cdnUrl: string;
  width: number | null;
  height: number | null;
  format: string | null;
}

export interface ImageAsset {
  id: string;
  cdnUrl: string;
  blurDataUrl?: string | null;
  altText?: string | null;
  focalPointX?: number | null;
  focalPointY?: number | null;
  dominantColor?: string | null;
  width?: number | null;
  height?: number | null;
  variants?: ImageAssetVariant[];
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  saleUnit: 'KG' | 'LITER' | 'UNIT' | 'PORTION';
  priceInCents: number | null;
  category: ProductCategory;
  subCategory?: ProductCategory | null;
  imageAsset?: ImageAsset | null;
}

export interface StoreOffer {
  id: string;
  merchantId: string;
  productId: string;
  priceInCents: number | null;
  minOrderQty: number;
  stepQty: number;
  maxOrderQty: number | null;
  isActive: boolean;
  product: Product;
  defaultPriceInCents: number | null;
  overridePriceInCents: number | null;
  effectivePriceInCents: number | null;
  isOverridden: boolean;
}

export interface AdminMerchantUser {
  id: string;
  email: string;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  lastLoginAt: string | null;
}

export interface AdminMerchantEntry {
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
  user: AdminMerchantUser;
  openingHours: MerchantHours[];
  pickupHours: MerchantHours[];
}

export interface AdminMerchantsPaginatedResponse {
  data: AdminMerchantEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateMerchantInvitePayload {
  email: string;
  storeName: string;
  businessType: 'HANOUTE' | 'PATISSERIE';
  phone?: string;
  address?: string;
  openingHours?: MerchantHours[];
  pickupHours: MerchantHours[];
}

export interface MerchantInviteResponse {
  id: string;
  email: string;
  status: string;
  inviteExpiresAt: string;
}

export interface StoreOffersPaginatedResponse {
  data: StoreOffer[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PublicStoreOffersCursorResponse {
  data: StoreOffer[];
  nextCursor: string | null;
  hasMore: boolean;
}
