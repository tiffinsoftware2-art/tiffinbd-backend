import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { OrderStatus } from '../entities/order.entity';
import { OrderSource } from '../../normalization/dto/unified-order.dto';

export class OrderFilterDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): string[] =>
    Array.isArray(value)
      ? (value as string[])
      : String(value)
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  settled?: boolean;

  // Order Delete — default (omitted) excludes archived orders entirely.
  // archived=true shows only archived orders; archived=false is equivalent
  // to the default (kept for symmetry with `settled`).
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean;

  // Order Completion — optional filter, mirrors `settled`'s shape (omitted =
  // no filtering, unlike `archived` which defaults to excluding). See ADR-011.
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  completed?: boolean;

  // Order History "special conditions" filter — one of Completed/Not
  // Completed/Deletion Requested/Updated in a single dropdown on the
  // frontend, only one active at a time. hasPendingDeleteRequest only
  // supports `true` (there's no meaningful "no pending request" filter use
  // case), mirroring the frontend not offering that option.
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasPendingDeleteRequest?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isUpdated?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

// CSV export — same filters as the list view, minus pagination (export
// returns every matching row, unpaginated). dateFrom/dateTo are required so
// every export is date-bounded; see order-history.md.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class OrderExportFilterDto {
  @IsNotEmpty()
  @IsString()
  @Matches(DATE_ONLY, { message: 'dateFrom must be in YYYY-MM-DD format' })
  dateFrom: string;

  @IsNotEmpty()
  @IsString()
  @Matches(DATE_ONLY, { message: 'dateTo must be in YYYY-MM-DD format' })
  dateTo: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): string[] =>
    Array.isArray(value)
      ? (value as string[])
      : String(value)
          .split(',')
          .map((v: string) => v.trim())
          .filter(Boolean),
  )
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  archived?: boolean;

  // Order History "special conditions" dropdown — added 2026-07-14. Was
  // missing entirely, so exporting while any of these was active in the list
  // view 400'd (forbidNonWhitelisted rejects the unrecognized query param).
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasPendingDeleteRequest?: boolean;

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isUpdated?: boolean;
}
