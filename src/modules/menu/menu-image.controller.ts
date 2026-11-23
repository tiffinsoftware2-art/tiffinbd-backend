import { Controller, Get, Header, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { MenuService } from './menu.service';

// Public, read-only: serves the photo uploaded for a menu item, so the website
// (and the dashboard) can show it in an <img>. The feed adds ?v=<time> to the
// link, so a changed photo gets a new URL and can be cached for a long time.
@Public()
@Controller('api/v1/menu-images')
export class MenuImageController {
  constructor(private readonly menuService: MenuService) {}

  @Get(':itemId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(@Param('itemId') itemId: string): Promise<StreamableFile> {
    const image = await this.menuService.getImage(itemId);
    if (!image) throw new NotFoundException('No uploaded image for this item');
    return new StreamableFile(image.data, { type: image.mime_type });
  }
}
