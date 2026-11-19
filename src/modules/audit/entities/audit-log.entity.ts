import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum';

export type AuditOutcome = 'SUCCESS' | 'FAILURE';

// Actor identity is a snapshot, with no FK to users: an audit trail that loses
// rows — or loses the ability to name the person — when an account is deleted
// is not an audit trail (ADR-019 §1). actor_role is likewise the role held at
// the time of the action, so a later promotion never rewrites history.
@Entity('audit_log')
@Index(['actor_user_id', 'created_at'])
@Index(['action', 'created_at'])
@Index(['entity_type', 'entity_id'])
@Index(['created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actor_user_id: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actor_username: string | null;

  @Column({ type: 'enum', enum: UserRole, nullable: true })
  actor_role: UserRole | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  actor_branch_id: string | null;

  @Column({ length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  entity_type: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  entity_id: string | null;

  @Column({ length: 10 })
  method: string;

  @Column({ length: 255 })
  path: string;

  @Column({ type: 'smallint' })
  status_code: number;

  @Column({ type: 'enum', enum: ['SUCCESS', 'FAILURE'] })
  outcome: AuditOutcome;

  @Column({ type: 'json', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip_address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_agent: string | null;

  @CreateDateColumn()
  created_at: Date;
}
