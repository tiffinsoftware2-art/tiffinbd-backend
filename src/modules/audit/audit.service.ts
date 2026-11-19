import { Injectable, Logger } from '@nestjs/common';
import { AuditLogFilterDto } from './dto/audit-log-filter.dto';
import { AuditEntry, AuditRepository, AuditSearchResult } from './audit.repository';

export type { AuditEntry };

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repo: AuditRepository) {}

  // Never throws. A failing audit write must not turn a successful business
  // operation into an error response (ADR-019 §5) — the gap is reported to the
  // application log instead, where it is visible without costing the user
  // their order.
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.repo.insert(entry);
    } catch (err) {
      this.logger.error({
        message: 'Failed to write audit row',
        service: 'tiffinbd-backend',
        context: AuditService.name,
        action: entry.action,
        actor: entry.actor_username,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  search(filters: AuditLogFilterDto): Promise<AuditSearchResult> {
    return this.repo.search(filters);
  }

  listActions(): Promise<string[]> {
    return this.repo.distinctActions();
  }
}
