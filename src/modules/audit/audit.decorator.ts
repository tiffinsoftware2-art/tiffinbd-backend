import { SetMetadata } from '@nestjs/common';

export const AUDIT_META = 'audit:meta';

export interface AuditMeta {
  action: string;
  entityType: string | null;
}

// Optional. A mutating route without it is still audited, under a name derived
// from its method and path (ADR-019 §3) — this only improves the label.
export const Audit = (action: string, entityType?: string) =>
  SetMetadata<string, AuditMeta>(AUDIT_META, { action, entityType: entityType ?? null });
