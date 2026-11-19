import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionRecord, PipelineStatus, SourcePlatform } from './entities/ingestion-record.entity';

@Injectable()
export class IngestRepository {
  constructor(
    @InjectRepository(IngestionRecord)
    private readonly repo: Repository<IngestionRecord>,
  ) {}

  async create(params: {
    externalOrderId: string;
    sourcePlatform: SourcePlatform;
    rawPayload: Record<string, unknown>;
    normalizedPayload: Record<string, unknown>;
    sourceIp: string | null;
  }): Promise<IngestionRecord> {
    const record = this.repo.create({
      externalOrderId: params.externalOrderId,
      sourcePlatform: params.sourcePlatform,
      pipelineStatus: PipelineStatus.RECEIVED,
      rawPayload: params.rawPayload,
      normalizedPayload: params.normalizedPayload,
      sourceIp: params.sourceIp,
      cancelReason: null,
      appOrderId: null,
      validatedAt: null,
      forwardedAt: null,
    });
    return this.repo.save(record);
  }

  async findByExternalId(
    externalOrderId: string,
    sourcePlatform: SourcePlatform,
  ): Promise<IngestionRecord | null> {
    return this.repo.findOne({ where: { externalOrderId, sourcePlatform } });
  }
}
