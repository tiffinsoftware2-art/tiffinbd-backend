import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PLATFORM_MENU_SOURCES } from '../platform-menu.constants';
import type { PlatformMenuSource } from '../platform-menu.constants';

export class CreatePlatformMenuItemDto {
  @IsIn(PLATFORM_MENU_SOURCES)
  platform: PlatformMenuSource;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  serial?: number | null;
}

// The platform of an existing item cannot be changed: delete and re-create it
// on the other platform instead.
export class UpdatePlatformMenuItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsInt()
  serial?: number | null;
}

export class CopyFromWebsiteDto {
  @IsIn(PLATFORM_MENU_SOURCES)
  platform: PlatformMenuSource;
}
