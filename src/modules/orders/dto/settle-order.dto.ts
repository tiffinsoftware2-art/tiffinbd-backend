import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { OptionalPaymentDto } from './payment.dto';

// May also carry the payment, chosen while settling.
export class SettleOrderDto extends OptionalPaymentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  actionTaken: string;
}
