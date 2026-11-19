import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Single-row config table — id is always 1.
@Entity('escalation_config')
export class EscalationConfig {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  // ── SMTP ──────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpHost: string | null;

  @Column({ type: 'int', default: 587 })
  smtpPort: number;

  @Column({ type: 'boolean', default: false })
  smtpSecure: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpUser: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smtpPass: string | null;

  // ── From ──────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 255, nullable: true })
  fromEmail: string | null;

  @Column({ type: 'varchar', length: 255, default: 'TiffinBD' })
  fromName: string;

  // ── Recipients ────────────────────────────────────────────────────────────
  // JSON-serialised string[]: '["a@b.com","c@d.com"]'
  @Column({ type: 'text', nullable: true })
  recipients: string | null;

  // ── Template ──────────────────────────────────────────────────────────────
  @Column({
    type: 'varchar',
    length: 500,
    default: '[TiffinBD] Order Escalated: #{{externalId}}',
  })
  subjectTemplate: string;

  @Column({ type: 'text', nullable: true })
  bodyTemplate: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
