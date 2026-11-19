import { UnifiedOrderDto } from '../dto/unified-order.dto';

export interface IOrderAdapter<T> {
  normalize(raw: T): UnifiedOrderDto;
}
