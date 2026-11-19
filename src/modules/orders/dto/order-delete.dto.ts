import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { DeleteReason } from '../entities/order.entity';
import { DeleteRequestStatus } from '../entities/order-delete-request.entity';

// Shared by the direct-archive endpoint (ADMIN/SUPER_ADMIN) and the
// delete-request endpoint (everyone else) — same reason vocabulary either way.
// customReason is required only when reason is OTHER.
export class ArchiveOrderDto {
  @IsEnum(DeleteReason)
  reason: DeleteReason;

  @ValidateIf((o: ArchiveOrderDto) => o.reason === DeleteReason.OTHER)
  @IsString()
  @MaxLength(500)
  customReason?: string;
}

export class CreateDeleteRequestDto {
  @IsEnum(DeleteReason)
  reason: DeleteReason;

  @ValidateIf((o: CreateDeleteRequestDto) => o.reason === DeleteReason.OTHER)
  @IsString()
  @MaxLength(500)
  customReason?: string;
}

export class RejectDeleteRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class DeleteRequestFilterDto {
  @IsOptional()
  @IsEnum(DeleteRequestStatus)
  status?: DeleteRequestStatus;
}
