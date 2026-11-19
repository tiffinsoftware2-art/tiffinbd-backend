import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CreateWebsiteOrderDto } from './dto/website-order.dto';
import { IpWhitelistGuard } from './guards/ip-whitelist.guard';
import { IngestSecretGuard } from './guards/ingest-secret.guard';
import { IngestService } from './ingest.service';

@Controller('api/v1/ingest')
@Public()
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('website')
  @UseGuards(IpWhitelistGuard, IngestSecretGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async ingestWebsiteOrder(
    @Body() dto: CreateWebsiteOrderDto,
    @Req() req: Request,
  ): Promise<{ ingestionId: string; status: string }> {
    const sourceIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null;

    const record = await this.ingestService.handleWebsiteOrder(dto, sourceIp);

    return { ingestionId: record.id, status: 'RECEIVED' };
  }
}
