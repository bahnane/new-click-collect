export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'READY'
  | 'COLLECTED'
  | 'CANCELLED';

export interface OrderMerchant {
  id: string;
  storeName: string;
}

export interface OrderItemProduct {
  id: string;
  name: string;
  saleUnit: 'KG' | 'G' | 'LITER' | 'UNIT' | 'PORTION';
}

export interface OrderItem {
  id: string;
  productId: string;
  storeOfferId: string;
  productName: string;
  saleUnit: 'KG' | 'G' | 'LITER' | 'UNIT' | 'PORTION';
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  merchantId: string;
  status: OrderStatus;
  estimatedTotalInCents: number;
  finalTotalInCents: number | null;
  pickupStartsAt: string;
  pickupEndsAt: string;
  note: string | null;
  createdAt: string;
  collectedAt: string | null;
  cancelledAt: string | null;
  merchant: OrderMerchant;
  items: OrderItem[];
}
