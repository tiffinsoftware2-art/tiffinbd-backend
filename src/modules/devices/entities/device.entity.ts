import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 36 })
  user_id: string;

  // NULL for supervisor roles, which oversee every branch and are assigned none
  // (ADR-020). Every branch-scoped lookup matches on equality, which NULL never
  // satisfies, so these rows stay invisible to per-branch fan-out and counts.
  @Column({ type: 'varchar', length: 36, nullable: true })
  branch_id: string | null;

  @Column({ length: 500 })
  fcm_token: string;

  @UpdateDateColumn()
  updated_at: Date;
}
