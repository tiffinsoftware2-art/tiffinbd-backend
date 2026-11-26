import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import {
  CustomerFilterDto,
  CustomerOrdersFilterDto,
} from './dto/customer-filter.dto';
import { CustomersService } from './customers.service';

// The Customers list is ADMIN+ only (Admin and Super Admin), unscoped by
// branch. The sidebar entry and the page's role list ['SUPER_ADMIN', 'ADMIN']
// must change with this. Marking an order paid is PATCH /orders/:id/payment.
@Controller('api/v1/customers')
@Roles(UserRole.ADMIN)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query() filters: CustomerFilterDto) {
    return this.customers.list(filters);
  }

  @Get('orders')
  orders(@Query() filters: CustomerOrdersFilterDto) {
    return this.customers.ordersFor(filters.phone);
  }

  // Manual Order Entry fills in a returning customer's name and address from
  // their phone number. Branch Manager+ — the roles that can enter orders.
  @Get('lookup')
  @Roles(UserRole.BRANCH_MANAGER)
  lookup(@Query() filters: CustomerOrdersFilterDto) {
    return this.customers
      .lookup(filters.phone)
      .then((c) => c ?? { found: false });
  }
}
