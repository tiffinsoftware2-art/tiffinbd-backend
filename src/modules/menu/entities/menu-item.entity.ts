import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MenuCategory } from './menu-category.entity';

@Entity('menu_items')
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  external_id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'simple-json', nullable: true })
  images: string[] | null;

  @Column({ default: false })
  is_popular: boolean;

  @Column({ default: false })
  vat_inclusive: boolean;

  @Column({ default: false })
  sc_inclusive: boolean;

  @Column({ default: false })
  is_never_kot: boolean;

  @Column({ default: false })
  is_no_discount: boolean;

  @Column({ type: 'int', nullable: true })
  serial: number | null;

  @ManyToOne(() => MenuCategory, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'category_id' })
  category: MenuCategory | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
