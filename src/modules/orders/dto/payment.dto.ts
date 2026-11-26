import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaymentMethod, PaymentStatus } from '../entities/order.entity';

// A recorded payment: Paid (with how) or Due. Never "Pending": that is only
// the state before anyone has chosen.
export class RecordPaymentDto {
  @IsIn([PaymentStatus.PAID, PaymentStatus.DUE])
  paymentStatus: PaymentStatus;

  @ValidateIf((o: RecordPaymentDto) => o.paymentStatus === PaymentStatus.PAID)
  @IsEnum(PaymentMethod, { message: 'Choose how the order was paid' })
  paymentMethod?: PaymentMethod;
}

// Complete / settle may carry the payment, chosen in the same step.
export class OptionalPaymentDto {
  @IsOptional()
  @IsIn([PaymentStatus.PAID, PaymentStatus.DUE])
  paymentStatus?: PaymentStatus;

  @ValidateIf((o: OptionalPaymentDto) => o.paymentStatus === PaymentStatus.PAID)
  @IsEnum(PaymentMethod, { message: 'Choose how the order was paid' })
  paymentMethod?: PaymentMethod;
}

export class CreatePaymentChangeRequestDto extends RecordPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Say why the payment needs to change' })
  @MaxLength(500)
  reason: string;
}

export class ReviewPaymentChangeRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
