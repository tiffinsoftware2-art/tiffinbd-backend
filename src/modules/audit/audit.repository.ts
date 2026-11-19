import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditSearchResult {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

// Everything the interceptor supplies; id and created_at are generated.
export type AuditEntry = Omit<AuditLog, 'id' | 'created_at'>;

@Injectable()
export class AuditRepository {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  // save(), not insert(), matching the rest of the codebase (auth.repository,
  // ingest.repository). insert() takes QueryDeepPartialEntity, which maps the
  // json `payload` column to a deep-partial and rejects a plain
  // Record<string, unknown>; DeepPartial<T> includes T itself, so save() takes
  // it as-is. A row with no id is an INSERT either way.
  async insert(entry: AuditEntry): Promise<void> {
    await this.repo.save(entry);
  }

  async search(filters: AuditLogFilterDto): Promise<AuditSearchResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.repo.createQueryBuilder('a');

    if (filters.actorUserId) {
      qb.andWhere('a.actor_user_id = :actorUserId', { actorUserId: filters.actorUserId });
    }
    if (filters.action) {
      qb.andWhere('a.action = :action', { action: filters.action });
    }
    if (filters.entityType) {
      qb.andWhere('a.entity_type = :entityType', { entityType: filters.entityType });
    }
    if (filters.entityId) {
      qb.andWhere('a.entity_id = :entityId', { entityId: filters.entityId });
    }
    if (filters.outcome) {
      qb.andWhere('a.outcome = :outcome', { outcome: filters.outcome });
    }
    if (filters.from) {
      qb.andWhere('a.created_at >= :from', { from: new Date(filters.from) });
    }
    if (filters.to) {
      qb.andWhere('a.created_at <= :to', { to: new Date(filters.to) });
    }
    if (filters.q) {
      const q = `%${filters.q}%`;
      qb.andWhere(
        new Brackets((w) => {
          w.where('a.actor_username LIKE :q', { q })
            .orWhere('a.action LIKE :q', { q })
            .orWhere('a.entity_id LIKE :q', { q });
        }),
      );
    }

    qb.orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async distinctActions(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('a')
      .select('DISTINCT a.action', 'action')
      .orderBy('a.action', 'ASC')
      .getRawMany<{ action: string }>();

    return rows.map((r) => r.action);
  }
}
