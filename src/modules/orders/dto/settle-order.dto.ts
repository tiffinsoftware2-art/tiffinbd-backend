import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SettleOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  actionTaken: string;
}
