import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One record per customer. The phone number (in the standard form from
// common/utils/phone.ts) is the unique key. Saved automatically whenever an
// order with a phone number is created or edited; name and address are the
// latest non-blank values given.
@Entity('customers')
@Index('IDX_customers_phone', ['phone'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
