import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';

// Strict YYYY-MM-DD — these values are reflected into a Content-Disposition
// filename, so format must be constrained to prevent header injection.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ReportFilterDto {
  @IsNotEmpty()
  @IsString()
  @Matches(DATE_ONLY, { message: 'dateFrom must be in YYYY-MM-DD format' })
  dateFrom: string;

  @IsNotEmpty()
  @IsString()
  @Matches(DATE_ONLY, { message: 'dateTo must be in YYYY-MM-DD format' })
  dateTo: string;

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
  @IsIn(['xlsx', 'pdf'])
  format?: 'xlsx' | 'pdf';
}
