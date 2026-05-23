export interface CartMerchant {
  id: string;
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
