import { IsEnum, IsOptional } from 'class-validator';
import { PaymentMethod, PaymentStatus } from '../entities/order.entity';

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  paymentStatus: PaymentStatus;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
}
