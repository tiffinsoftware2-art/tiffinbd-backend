import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  // The database returns the flag as 1/0, so accept that (and 'true'/'false') too.
  @Transform(({ value }: { value: unknown }) =>
    value === 1 || value === '1' || value === 'true'
      ? true
      : value === 0 || value === '0' || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  is_active?: boolean;
}
