import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { Audit } from '../audit/audit.decorator';
import type { JwtPayload } from '../auth/auth.service';
import { AddOrderAddonDto } from './dto/add-order-addon.dto';
import { OrderAddonsService } from './order-addons.service';

@Controller('api/v1/orders')
export class OrderAddonsController {
  constructor(private readonly orderAddons: OrderAddonsService) {}

  // Same permission as editing an order (PATCH /orders/manual/:id).
  @Audit('ORDER_ADDON_ADD', 'order')
  @Post(':id/addons')
  @Roles(UserRole.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  add(
    @Param('id') id: string,
    @Body() dto: AddOrderAddonDto,
    @CurrentUser() actor: JwtPayload,
  ) {
    return this.orderAddons.addToOrder(id, dto, actor);
  }
}
