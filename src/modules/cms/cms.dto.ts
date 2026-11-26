import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateSlideDto {
  @IsString()
  @MaxLength(255)
  alt: string;
}

export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids: string[];
}

export class CreateVideoDto {
  // A YouTube link (any usual form) or the bare video ID.
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}

export class UpdateVideoDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;
}
