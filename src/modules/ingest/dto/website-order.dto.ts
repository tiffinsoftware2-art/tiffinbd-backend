import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export enum WebsiteOrderType {
  DELIVERY = 'DELIVERY',
  PICKUP = 'PICKUP',
  DINE_IN = 'DINE_IN',
}

export enum WebsitePaymentType {
  CASH = 'CASH',
  ONLINE = 'ONLINE',
}

export class WebsiteOrderItemDto {
  @IsString()
  @IsNotEmpty()
  itemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsArray()
  @IsOptional()
  selections?: unknown[];

  @IsString()
  @IsOptional()
  note?: string;
}

export class CreateWebsiteOrderDto {
  @IsString()
  @IsOptional()
  source?: string;

  @IsEnum(WebsitePaymentType)
  paymentType: WebsitePaymentType;

  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  branchId: string;

  @IsEnum(WebsiteOrderType)
  orderType: WebsiteOrderType;

  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  @IsString()
  @IsOptional()
  customerAddress?: string;

  @IsNumber()
  @IsOptional()
  customerAddressLat?: number;

  @IsNumber()
  @IsOptional()
  customerAddressLng?: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsOptional()
  otpToken?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WebsiteOrderItemDto)
  orderItems: WebsiteOrderItemDto[];

  @IsNumber()
  @Min(0)
  subTotal: number;

  @IsNumber()
  @Min(0)
  total: number;

  // Pricing breakdown fields below — all optional and deliberately NOT
  // type/range-validated here. Missing, null, or malformed values must never
  // block ingestion (see ADR-005 Addendum 4) — they're coerced to a safe
  // default in TiffinBDAdapter instead of being rejected by the DTO layer.
  @IsOptional()
  vatPercent?: unknown;

  @IsOptional()
  vatAmount?: unknown;

  @IsOptional()
  deliveryCharge?: unknown;

  @IsOptional()
  platformFee?: unknown;

  @IsOptional()
  discountType?: unknown;

  @IsOptional()
  discountValue?: unknown;

  @IsOptional()
  discountAmount?: unknown;
}
