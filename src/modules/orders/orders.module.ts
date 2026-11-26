import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { SettingsModule } from '../settings/settings.module';
import { Order } from './entities/order.entity';
import { OrderHistory } from './entities/order-history.entity';
import { OrderEditHistory } from './entities/order-edit-history.entity';
import { OrderDeleteRequest } from './entities/order-delete-request.entity';
import { OrderCompletion } from './entities/order-completion.entity';
import { PaymentChangeRequest } from './entities/payment-change-request.entity';
import { Customer } from '../customers/entities/customer.entity';
import { PaymentChangeController } from './payment-change.controller';
import { PaymentChangeService } from './payment-change.service';
import { OrdersController } from './orders.controller';
import { OrdersGateway } from './orders.gateway';
import { OrdersRepository } from './orders.repository';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderHistory,
      OrderEditHistory,
      OrderDeleteRequest,
      OrderCompletion,
      PaymentChangeRequest,
      Customer,
      MenuItem,
      Branch,
      User,
    ]),
    AuthModule,
    SettingsModule,
  ],
  controllers: [OrdersController, PaymentChangeController],
  providers: [OrdersService, OrdersRepository, OrdersGateway, PaymentChangeService],
  exports: [OrdersService],
})
export class OrdersModule {}
