export interface OrderItemDto {
  externalItemId?: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}
