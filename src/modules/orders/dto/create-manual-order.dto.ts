import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  MANUAL_ORDER_SOURCES,
  OrderSource,
  OrderType,
} from '../../normalization/dto/unified-order.dto';

export class ManualOrderItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  price: number;
}

export class CreateManualOrderDto {
  @IsIn(MANUAL_ORDER_SOURCES)
  source: OrderSource;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsIn(Object.values(OrderType))
  orderType: OrderType;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @IsString()
  @IsNotEmpty()
  customerAddress: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManualOrderItemDto)
  items: ManualOrderItemDto[];

  // Whether VAT is excluded for this specific order. Sent by the frontend's
  // "Exclude VAT for this order" checkbox (orders/new/page.tsx), which is
  // itself seeded from the per-source rule in manual_order_config — see
  // ADR-005 Addendum 6.
  //   true    → VAT 0
  //   false   → the configured rate, overriding the source rule
  //   omitted → the source rule decides
  // Replaced the earlier `vatPercent?: number` convention, which could only
  // ever express "exclude" (as 0) and so could not carry an explicit
  // "include anyway". The VAT *rate* is never accepted from the client.
  @IsOptional()
  @IsBoolean()
  excludeVat?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryCharge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  platformFee?: number;

  @IsOptional()
  @IsIn(['percentage', 'fixed'])
  discountType?: 'percentage' | 'fixed';

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;
}
