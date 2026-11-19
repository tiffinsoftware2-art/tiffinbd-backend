import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum SourcePlatform {
  WEBSITE = 'WEBSITE',
  FOODPANDA = 'FOODPANDA',
  PATHAO = 'PATHAO',
  FOODIE = 'FOODIE',
}

export enum PipelineStatus {
  RECEIVED = 'RECEIVED',
  VALIDATING = 'VALIDATING',
  VALIDATED = 'VALIDATED',
  CANCELLED = 'CANCELLED',
}

@Entity('ingestion_records')
@Index(['externalOrderId', 'sourcePlatform'], { unique: true })
@Index(['pipelineStatus'])
@Index(['receivedAt'])
export class IngestionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_order_id', length: 255 })
  externalOrderId: string;

  @Column({ name: 'source_platform', type: 'enum', enum: SourcePlatform })
  sourcePlatform: SourcePlatform;

  @Column({
    name: 'pipeline_status',
    type: 'enum',
    enum: PipelineStatus,
    default: PipelineStatus.RECEIVED,
  })
  pipelineStatus: PipelineStatus;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 255, nullable: true, default: null })
  cancelReason: string | null;

  @Column({ name: 'raw_payload', type: 'json' })
  rawPayload: Record<string, unknown>;

  @Column({ name: 'normalized_payload', type: 'json', nullable: true, default: null })
  normalizedPayload: Record<string, unknown> | null;

  @Column({ name: 'app_order_id', type: 'varchar', length: 36, nullable: true, default: null })
  appOrderId: string | null;

  @Column({ name: 'source_ip', type: 'varchar', length: 45, nullable: true, default: null })
  sourceIp: string | null;

  @Column({
    name: 'received_at',
    type: 'datetime',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
  })
  receivedAt: Date;

  @Column({ name: 'validated_at', type: 'datetime', precision: 3, nullable: true, default: null })
  validatedAt: Date | null;

  @Column({ name: 'forwarded_at', type: 'datetime', precision: 3, nullable: true, default: null })
  forwardedAt: Date | null;
}
