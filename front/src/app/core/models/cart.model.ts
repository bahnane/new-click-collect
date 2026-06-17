export interface CartMerchant {
  id: string;
  slug?: string;
  storeName: string;
}

export interface CartItemProduct {
  id: string;
  name: string;
  description: string | null;
  saleUnit: 'KG' | 'LITER' | 'UNIT' | 'PORTION';
}

export interface CartItem {
  id: string;
  quantity: number;
  lineTotalInCents: number;
  storeOfferId: string;
  product: CartItemProduct;
  defaultPriceInCents: number | null;
  overridePriceInCents: number | null;
  effectivePriceInCents: number;
  isOverridden: boolean;
}

export interface CartResponse {
  id?: string;
  merchant?: CartMerchant | null;
  merchantId: string | null;
  items: CartItem[];
  totalEstimatedInCents: number;
}

export interface CartSummaryResponse {
  id: string;
  merchantId: string;
  merchant: CartMerchant | null;
  itemsCount: number;
  totalEstimatedInCents: number;
  updatedAt: string;
}
