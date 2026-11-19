import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LoginResult = 'SUCCESS' | 'FAILURE';

@Entity('login_audit')
export class LoginAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  user_id: string | null;

  @Index()
  @Column({ length: 100 })
  username: string;

  @Column({ type: 'enum', enum: ['SUCCESS', 'FAILURE'] })
  result: LoginResult;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failure_reason: string | null;

  @Index()
  @Column({ length: 45 })
  ip_address: string;

  @CreateDateColumn()
  attempted_at: Date;
}
