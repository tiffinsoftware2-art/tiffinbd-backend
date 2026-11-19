import { Injectable, Logger } from '@nestjs/common';
import { NormalizationService } from '../normalization/normalization.service';
import { OrdersService } from '../orders/orders.service';
import { CreateWebsiteOrderDto } from './dto/website-order.dto';
import { IngestionRecord, SourcePlatform } from './entities/ingestion-record.entity';
import { IngestRepository } from './ingest.repository';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly ingestRepository: IngestRepository,
    private readonly normalizationService: NormalizationService,
    private readonly ordersService: OrdersService,
  ) {}

  async handleWebsiteOrder(
    dto: CreateWebsiteOrderDto,
    sourceIp: string | null,
  ): Promise<IngestionRecord> {
    const unified = await this.normalizationService.normalizeWebsiteOrder(dto);

    const record = await this.ingestRepository.create({
      externalOrderId: unified.externalId,
      sourcePlatform: SourcePlatform.WEBSITE,
      rawPayload: unified.rawPayload,
      normalizedPayload: unified as unknown as Record<string, unknown>,
      sourceIp,
    });

    this.logger.log({
      message: 'Website order received',
      service: 'tiffinbd-backend',
      context: IngestService.name,
      ingestionId: record.id,
      externalOrderId: unified.externalId,
      customer: unified.customerInfo.name,
      itemCount: unified.items.length,
    });

    await this.ordersService.storeOrder(unified, unified.branchId ?? null);

    return record;
  }
}
