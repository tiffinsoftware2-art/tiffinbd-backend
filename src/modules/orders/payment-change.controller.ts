import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Audit } from '../audit/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/auth.service';
import {
  CreatePaymentChangeRequestDto,
  ReviewPaymentChangeRequestDto,
} from './dto/payment.dto';
import { PaymentChangeRequestStatus } from './entities/payment-change-request.entity';
import { PaymentChangeService } from './payment-change.service';

// Payment change requests. Anyone who can see the order can ask; only
// Admin / Super Admin see the queue and approve or reject.
@Controller('api/v1/payment-change-requests')
@Roles(UserRole.STAFF)
export class PaymentChangeController {
  constructor(private readonly service: PaymentChangeService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query('status') status?: string) {
    const s = Object.values(PaymentChangeRequestStatus).includes(
      status as PaymentChangeRequestStatus,
    )
      ? (status as PaymentChangeRequestStatus)
      : PaymentChangeRequestStatus.PENDING;
    return this.service.list(s);
  }

  @Get('order/:orderId')
  forOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.listForOrder(orderId, actor);
  }

  @Audit('PAYMENT_CHANGE_REQUEST', 'order')
  @Post('order/:orderId')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('orderId') orderId: string,
    @Body() dto: CreatePaymentChangeRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.createRequest(orderId, dto, actor);
  }

  @Audit('PAYMENT_CHANGE_APPROVE', 'payment_change_request')
  @Patch(':id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id') id: string,
    @Body() dto: ReviewPaymentChangeRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.approve(id, actor, dto.note);
  }

  @Audit('PAYMENT_CHANGE_REJECT', 'payment_change_request')
  @Patch(':id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body() dto: ReviewPaymentChangeRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.service.reject(id, actor, dto.note);
  }
}
