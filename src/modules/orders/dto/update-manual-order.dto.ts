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
  OrderSource,
  OrderType,
} from '../../normalization/dto/unified-order.dto';
import { ManualOrderItemDto } from './create-manual-order.dto';

// branchId is intentionally not editable — an order's branch is fixed at
// creation. excludeVat is NOT a rate editor — omitted, the per-source rule in
// manual_order_config decides, and failing that the existing snapshot is kept
// (or seeded from config on the first edit of an integrated-platform order),
// unchanged from ADR-005/ADR-006. Sent by the frontend's "Exclude VAT"
// checkbox (orders/new/page.tsx). See ADR-005 Addendum 6.
//
// Unlike CreateManualOrderDto, `source` here allows the FULL OrderSource
// enum, not just MANUAL_ORDER_SOURCES — Order Update
// can edit any order regardless of how it originally arrived, and must be
// able to re-save its existing source unchanged (see ADR-006 — "all sources
// updatable", corrected 2026-07-06 from an initial manual-orders-only scope).
export class UpdateManualOrderDto {
  @IsIn(Object.values(OrderSource))
  source: OrderSource;

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

  // Whether VAT is excluded for this specific order.
  //   true    → VAT 0
  //   false   → the configured rate / existing snapshot, overriding the
  //             per-source rule
  //   omitted → the per-source rule for dto.source decides
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
