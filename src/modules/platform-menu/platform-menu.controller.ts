import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { Audit } from '../audit/audit.decorator';
import {
  CopyFromWebsiteDto,
  CreatePlatformMenuItemDto,
  UpdatePlatformMenuItemDto,
} from './dto/platform-menu-item.dto';
import { PlatformMenuService } from './platform-menu.service';

// Private to the dashboard (every route needs a login). The website's public
// /api/v1/online feed never reads this, so platform menus cannot leak onto it.
@Controller('api/v1/platform-menu')
export class PlatformMenuController {
  constructor(private readonly service: PlatformMenuService) {}

  @Get()
  @Roles(UserRole.STAFF)
  findAll(@Query('platform') platform?: string) {
    return this.service.findAll(platform);
  }

  @Audit('PLATFORM_MENU_ITEM_CREATE', 'platform_menu_item')
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePlatformMenuItemDto) {
    return this.service.create(dto);
  }

  @Audit('PLATFORM_MENU_COPY', 'platform_menu_item')
  @Post('copy-from-website')
  @Roles(UserRole.ADMIN)
  copyFromWebsite(@Body() dto: CopyFromWebsiteDto) {
    return this.service.copyFromWebsite(dto.platform);
  }

  @Audit('PLATFORM_MENU_ITEM_UPDATE', 'platform_menu_item')
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePlatformMenuItemDto) {
    return this.service.update(id, dto);
  }

  @Audit('PLATFORM_MENU_ITEM_DELETE', 'platform_menu_item')
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
