import { Injectable } from '@nestjs/common';
import { CreateWebsiteOrderDto } from '../ingest/dto/website-order.dto';
import { TiffinBDAdapter } from './adapters/tiffinbd.adapter';
import { UnifiedOrderDto } from './dto/unified-order.dto';

@Injectable()
export class NormalizationService {
  constructor(private readonly tiffinBDAdapter: TiffinBDAdapter) {}

  normalizeWebsiteOrder(raw: CreateWebsiteOrderDto): Promise<UnifiedOrderDto> {
    return this.tiffinBDAdapter.normalize(raw);
  }
}
