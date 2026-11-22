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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { InternalServiceTokenGuard } from '../../common/guards/internal-service-token.guard';
import { UserRole } from '../../common/enums/user-role.enum';
import type { JwtPayload } from '../auth/auth.service';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';
import { UpdateManualOrderDto } from './dto/update-manual-order.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { OrderExportFilterDto, OrderFilterDto } from './dto/order-filter.dto';
import { SettleOrderDto } from './dto/settle-order.dto';
import {
  ArchiveOrderDto,
  CreateDeleteRequestDto,
  DeleteRequestFilterDto,
  RejectDeleteRequestDto,
} from './dto/order-delete.dto';
import { OrdersService } from './orders.service';
import { Audit } from '../audit/audit.decorator';

@Controller('api/v1/orders')
@Roles(UserRole.STAFF)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@Query() filters: OrderFilterDto, @CurrentUser() actor: JwtPayload) {
    return this.ordersService.findAll(filters, actor);
  }

  // Order Delete review queue — MUST be declared before @Get(':id') below,
  // otherwise Nest/Express would match "delete-requests" as an :id value.
  @Get('delete-requests')
  @Roles(UserRole.MANAGER)
  listDeleteRequests(@Query() filters: DeleteRequestFilterDto) {
    return this.ordersService.listDeleteRequests(filters.status);
  }

  // Order History XLSX export — MUST also be declared before @Get(':id')
  // below, same reason as delete-requests above. See order-history.md / ADR-009.
  @Get('export')
  async exportXlsx(
    @Query() filters: OrderExportFilterDto,
    @CurrentUser() actor: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.ordersService.exportOrdersXlsx(
      filters,
      actor,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Audit('ORDER_MANUAL_CREATE', 'order')
  @Post('manual')
  @Roles(UserRole.BRANCH_MANAGER)
  @HttpCode(HttpStatus.CREATED)
  createManual(
    @Body() dto: CreateManualOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.createManualOrder(dto, actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.ordersService.findOne(id, actor);
  }

  @Audit('ORDER_MANUAL_UPDATE', 'order')
  @Patch('manual/:id')
  @Roles(UserRole.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  updateManual(
    @Param('id') id: string,
    @Body() dto: UpdateManualOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.updateManualOrder(id, dto, actor);
  }

  // Admin+ — mark an order Paid or Due (used from the Customers page).
  @Audit('ORDER_PAYMENT_UPDATE', 'order')
  @Patch(':id/payment')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  updatePayment(@Param('id') id: string, @Body() dto: UpdatePaymentStatusDto) {
    return this.ordersService.updatePaymentStatus(
      id,
      dto.paymentStatus,
      dto.paymentMethod,
    );
  }

  @Audit('ORDER_ACCEPT', 'order')
  @Patch(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.ordersService.acceptOrder(id, actor);
  }

  @Audit('ORDER_ESCALATE', 'order')
  @Patch(':id/escalate')
  @Public()
  @UseGuards(InternalServiceTokenGuard)
  @HttpCode(HttpStatus.OK)
  escalate(@Param('id') id: string) {
    return this.ordersService.escalateOrder(id);
  }

  @Audit('ORDER_SETTLE', 'order')
  @Patch(':id/settle')
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  settle(
    @Param('id') id: string,
    @Body() dto: SettleOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.settleOrder(id, dto.actionTaken, actor);
  }

  // Order Completion — see order-completion.md / ADR-011. No @Roles override
  // — reachable by any authenticated, branch-scoped role (STAFF via mobile,
  // BRANCH_MANAGER+ via dashboard), same shape as accept().
  @Audit('ORDER_COMPLETE', 'order')
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.ordersService.completeOrder(id, actor);
  }

  // Order Delete — see order-delete.md / ADR-007.
  //
  // Archive/unarchive and the request review path are MANAGER+ as of
  // 2026-07-15 (was ADMIN+). ADR-007's original "only Admin acts immediately,
  // everyone else requests" split still holds — the line just moved down to
  // MANAGER, so BRANCH_MANAGER/STAFF remain request-only.
  @Audit('ORDER_ARCHIVE', 'order')
  @Post(':id/archive')
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveOrderDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.archiveOrder(id, dto, actor);
  }

  @Audit('ORDER_UNARCHIVE', 'order')
  @Patch(':id/unarchive')
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  unarchive(@Param('id') id: string, @CurrentUser() actor: JwtPayload) {
    return this.ordersService.unarchiveOrder(id, actor);
  }

  @Audit('ORDER_DELETE_REQUEST', 'order')
  @Post(':id/delete-requests')
  @HttpCode(HttpStatus.CREATED)
  createDeleteRequest(
    @Param('id') id: string,
    @Body() dto: CreateDeleteRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.createDeleteRequest(id, dto, actor);
  }

  @Audit('ORDER_DELETE_APPROVE', 'order_delete_request')
  @Patch('delete-requests/:id/approve')
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  approveDeleteRequest(
    @Param('id') id: string,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.approveDeleteRequest(id, actor);
  }

  @Audit('ORDER_DELETE_REJECT', 'order_delete_request')
  @Patch('delete-requests/:id/reject')
  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  rejectDeleteRequest(
    @Param('id') id: string,
    @Body() dto: RejectDeleteRequestDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.ordersService.rejectDeleteRequest(id, dto, actor);
  }
}
