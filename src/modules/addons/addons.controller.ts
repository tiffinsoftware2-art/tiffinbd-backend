import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { Audit } from '../audit/audit.decorator';
import { AddonsService } from './addons.service';
import { CreateAddonDto, UpdateAddonDto } from './dto/addon.dto';

@Controller('api/v1/addons')
export class AddonsController {
  constructor(private readonly addons: AddonsService) {}

  // Any signed-in staff can read the list (the order detail view needs it);
  // only admins change it — same split as the menu.
  @Get()
  @Roles(UserRole.STAFF)
  findAll() {
    return this.addons.findAll();
  }

  @Audit('ADDON_CREATE', 'addon')
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateAddonDto) {
    return this.addons.create(dto);
  }

  @Audit('ADDON_UPDATE', 'addon')
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateAddonDto) {
    return this.addons.update(id, dto);
  }

  @Audit('ADDON_DELETE', 'addon')
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.addons.remove(id);
  }
}
