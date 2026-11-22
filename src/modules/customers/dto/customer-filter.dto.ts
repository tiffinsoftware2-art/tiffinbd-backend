import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderSource } from '../../normalization/dto/unified-order.dto';

export class CustomerFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(OrderSource)
  source?: OrderSource;

  // 'true' = only customers who currently owe something.
  @IsOptional()
  @IsString()
  dueOnly?: string;

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

export class CustomerOrdersFilterDto {
  @IsString()
  @IsNotEmpty()
  phone: string;
}
