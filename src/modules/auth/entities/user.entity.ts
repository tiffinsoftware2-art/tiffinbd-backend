import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../common/enums/user-role.enum';

export { UserRole };

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ unique: true, length: 100 })
  username: string;

  @Column({ length: 255 })
  password_hash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'varchar', length: 36, nullable: true })
  branch_id: string | null;

  @Column({ default: false })
  must_change_password: boolean;

  @Column({ default: true })
  is_active: boolean;

  // Retired with the profile-photo feature (ADR-018).
  // Column deliberately kept: dropping it here would let
  // admin-seed.ts's synchronize:true delete it and its data.
  @Column({ type: 'varchar', length: 255, nullable: true })
  avatar_url: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
