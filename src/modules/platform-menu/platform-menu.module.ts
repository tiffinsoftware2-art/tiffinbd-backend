import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MenuModule } from '../menu/menu.module';
import { PlatformMenuItem } from './entities/platform-menu-item.entity';
import { PlatformMenuController } from './platform-menu.controller';
import { PlatformMenuService } from './platform-menu.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformMenuItem]), MenuModule],
  controllers: [PlatformMenuController],
  providers: [PlatformMenuService],
})
export class PlatformMenuModule {}
