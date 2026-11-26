import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { publicBaseUrl } from '../../common/utils/public-base-url';
import { OnlineMenuService } from './online-menu.service';

// Public, read-only menu feed for the customer website. @Public() skips the
// login guards for this whole class. Keep it read-only: nothing here may write.
@Public()
@Controller('api/v1/online')
export class OnlineMenuController {
  constructor(private readonly onlineMenu: OnlineMenuService) {}

  // The slug is accepted so the URL matches what the website requests
  // (/online/<slug>); there is only one company, so it is not used.
  @Get(':slug')
  async getMenu(@Req() req: Request) {
    return {
      success: true,
      message: 'OK',
      data: await this.onlineMenu.getTiffinData(publicBaseUrl(req)),
    };
  }
}
