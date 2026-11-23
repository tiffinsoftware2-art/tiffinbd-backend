import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { Audit } from '../audit/audit.decorator';
import { CreateMenuCategoryDto, UpdateMenuCategoryDto } from './dto/menu-category.dto';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/menu-item.dto';
import { MAX_MENU_IMAGE_BYTES } from './menu-image.util';
import { MenuService } from './menu.service';

@Controller('api/v1/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('categories')
  @Roles(UserRole.STAFF)
  findAllCategories() {
    return this.menuService.findAllCategories();
  }

  @Audit('MENU_CATEGORY_CREATE', 'menu_category')
  @Post('categories')
  @Roles(UserRole.ADMIN)
  createCategory(@Body() dto: CreateMenuCategoryDto) {
    return this.menuService.createCategory(dto);
  }

  @Audit('MENU_CATEGORY_UPDATE', 'menu_category')
  @Patch('categories/:id')
  @Roles(UserRole.ADMIN)
  updateCategory(@Param('id') id: string, @Body() dto: UpdateMenuCategoryDto) {
    return this.menuService.updateCategory(id, dto);
  }

  @Audit('MENU_CATEGORY_DELETE', 'menu_category')
  @Delete('categories/:id')
  @Roles(UserRole.ADMIN)
  deleteCategory(@Param('id') id: string) {
    return this.menuService.deleteCategory(id);
  }

  @Get('items')
  @Roles(UserRole.STAFF)
  findAllItems() {
    return this.menuService.findAllItems();
  }

  @Audit('MENU_ITEM_CREATE', 'menu_item')
  @Post('items')
  @Roles(UserRole.ADMIN)
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menuService.createItem(dto);
  }

  @Audit('MENU_ITEM_UPDATE', 'menu_item')
  @Patch('items/:id')
  @Roles(UserRole.ADMIN)
  updateItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menuService.updateItem(id, dto);
  }

  // Upload a photo for the item (multipart field "file"). It replaces the
  // item's image links on the website until it is removed.
  @Audit('MENU_ITEM_IMAGE_UPLOAD', 'menu_item')
  @Post('items/:id/image')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_MENU_IMAGE_BYTES } }))
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    return this.menuService.setImage(id, file);
  }

  @Audit('MENU_ITEM_IMAGE_DELETE', 'menu_item')
  @Delete('items/:id/image')
  @Roles(UserRole.ADMIN)
  deleteImage(@Param('id') id: string) {
    return this.menuService.removeImage(id);
  }

  @Audit('MENU_ITEM_DELETE', 'menu_item')
  @Delete('items/:id')
  @Roles(UserRole.ADMIN)
  deleteItem(@Param('id') id: string) {
    return this.menuService.deleteItem(id);
  }
}
