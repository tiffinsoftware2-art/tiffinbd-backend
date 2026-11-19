import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { SettingsModule } from '../settings/settings.module';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';
import { MenuController } from './menu.controller';
import { MenuRepository } from './menu.repository';
import { MenuService } from './menu.service';
import { OnlineMenuController } from './online-menu.controller';
import { OnlineMenuService } from './online-menu.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MenuCategory, MenuItem, Branch]),
    SettingsModule,
  ],
  controllers: [MenuController, OnlineMenuController],
  providers: [MenuService, MenuRepository, OnlineMenuService],
  exports: [MenuService],
})
export class MenuModule {}
