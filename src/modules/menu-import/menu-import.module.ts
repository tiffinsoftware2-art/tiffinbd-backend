import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuCategory } from '../menu/entities/menu-category.entity';
import { MenuItem } from '../menu/entities/menu-item.entity';
import { PlatformMenuItem } from '../platform-menu/entities/platform-menu-item.entity';
import { MenuImportController } from './menu-import.controller';
import { MenuImportService } from './menu-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([MenuItem, MenuCategory, PlatformMenuItem])],
  controllers: [MenuImportController],
  providers: [MenuImportService],
})
export class MenuImportModule {}
