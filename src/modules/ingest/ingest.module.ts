import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NormalizationModule } from '../normalization/normalization.module';
import { OrdersModule } from '../orders/orders.module';
import { IngestionRecord } from './entities/ingestion-record.entity';
import { IpWhitelistGuard } from './guards/ip-whitelist.guard';
import { IngestSecretGuard } from './guards/ingest-secret.guard';
import { IngestController } from './ingest.controller';
import { IngestRepository } from './ingest.repository';
import { IngestService } from './ingest.service';

@Module({
  imports: [TypeOrmModule.forFeature([IngestionRecord]), NormalizationModule, OrdersModule],
  controllers: [IngestController],
  providers: [IngestService, IngestRepository, IngestSecretGuard, IpWhitelistGuard],
})
export class IngestModule {}
