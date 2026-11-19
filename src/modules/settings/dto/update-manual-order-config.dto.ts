import { IsArray, IsIn, IsNumber, Max, Min } from 'class-validator';
import { OrderSource } from '../../normalization/dto/unified-order.dto';

export class UpdateManualOrderConfigDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent: number;

  @IsNumber()
  @Min(0)
  deliveryCharge: number;

  @IsNumber()
  @Min(0)
  platformFee: number;

  // Full replace, like every other field here — the Settings page submits the
  // whole section with one Save button. Every OrderSource value is
  // accepted: PATCH /orders/manual/:id can edit an order of any source.
  // See ADR-005 Addendum 6, decision 2.
  @IsArray()
  @IsIn(Object.values(OrderSource), { each: true })
  vatExcludedSources: OrderSource[];
}
