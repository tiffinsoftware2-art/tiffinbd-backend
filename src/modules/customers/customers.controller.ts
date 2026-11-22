import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CustomerFilterDto, CustomerOrdersFilterDto } from './dto/customer-filter.dto';
import { CustomersService } from './customers.service';

// ADMIN+ only (Admin and Super Admin), unscoped by branch. The sidebar entry
// and the page's role list ['SUPER_ADMIN', 'ADMIN'] must change with this.
// Read-only: marking an order paid is PATCH /orders/:id/payment.
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
}
