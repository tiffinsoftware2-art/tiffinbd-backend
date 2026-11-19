import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Single-row config table — id is always 1. Holds the global defaults for
// Manual Order Entry: VAT% (locked, not editable per-order — see ADR-005 and
// its 2026-07-07 addendum), plus delivery charge and platform fee, which
// remain editable per-order but now default from here instead of being
// hardcoded. Admin-only (Settings page).
@Entity('manual_order_config')
export class ManualOrderConfig {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  vatPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 27 })
  deliveryCharge: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 3 })
  platformFee: number;

  // JSON array of OrderSource values, e.g. '["FOODPANDA","PATHAO"]' — the
  // sources whose Manual Order Entry orders default to VAT-excluded. Null
  // means no source is excluded, i.e. behaviour prior to ADR-005 Addendum 6.
  // Stored as a JSON string in a text column, matching
  // escalation_config.recipients rather than a MySQL JSON column.
  @Column({ type: 'text', nullable: true })
  vatExcludedSources: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
