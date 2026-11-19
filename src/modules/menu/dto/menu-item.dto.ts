import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateMenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[] | null;

  @IsOptional()
  @IsBoolean()
  is_popular?: boolean;

  @IsOptional()
  @IsBoolean()
  vat_inclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  sc_inclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  is_never_kot?: boolean;

  @IsOptional()
  @IsBoolean()
  is_no_discount?: boolean;

  @IsOptional()
  @IsInt()
  serial?: number | null;
}

export class UpdateMenuItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[] | null;

  @IsOptional()
  @IsBoolean()
  is_popular?: boolean;

  @IsOptional()
  @IsBoolean()
  vat_inclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  sc_inclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  is_never_kot?: boolean;

  @IsOptional()
  @IsBoolean()
  is_no_discount?: boolean;

  @IsOptional()
  @IsInt()
  serial?: number | null;
}
