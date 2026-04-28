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

export interface OrderCustomer {
  id: string;
  email: string;
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

export interface OrderListItem {
  id: string;
  status: OrderStatus;
  estimatedTotalInCents: number;
  finalTotalInCents: number | null;
  pickupStartsAt: string;
  pickupEndsAt: string;
  createdAt: string;
  itemCount: number;
  merchant: OrderMerchant;
}

export interface PaginatedOrders {
  data: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MerchantOrderListItem {
  id: string;
  status: OrderStatus;
  estimatedTotalInCents: number;
  finalTotalInCents: number | null;
  pickupStartsAt: string;
  pickupEndsAt: string;
  createdAt: string;
  itemCount: number;
  customer: OrderCustomer;
}

export interface PaginatedMerchantOrders {
  data: MerchantOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MerchantOrder extends Omit<Order, 'merchant'> {
  customer: OrderCustomer;
}
