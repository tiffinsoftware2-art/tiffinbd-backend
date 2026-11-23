import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { OnlineMenuService } from './online-menu.service';

// Public address of this API as the visitor reached it (behind the reverse
// proxy), used to build links to uploaded menu photos. PUBLIC_BASE_URL, when
// set on the server, wins.
function publicBaseUrl(req: Request): string {
  const fixed = process.env.PUBLIC_BASE_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, '');
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.split(',')[0]?.trim();
  const proto = first(req.headers['x-forwarded-proto']) ?? req.protocol;
  const host = first(req.headers['x-forwarded-host']) ?? req.headers.host ?? '';
  return `${proto}://${host}`;
}

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
