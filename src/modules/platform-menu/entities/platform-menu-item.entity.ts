import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PLATFORM_MENU_SOURCES } from '../platform-menu.constants';
import type { PlatformMenuSource } from '../platform-menu.constants';

// One row per item on a delivery platform's own menu (Foodpanda, Pathao, ...).
// Deliberately separate from menu_items: platforms have their own dishes and
// prices, and none of this is returned by the website's online menu.
@Entity('platform_menu_items')
@Index('IDX_platform_menu_platform_name', ['platform', 'name'], {
  unique: true,
})
export class PlatformMenuItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: PLATFORM_MENU_SOURCES })
  platform: PlatformMenuSource;

  @Column({ length: 255 })
  name: string;

  // Free-text group heading shown in the dashboard and order picker.
  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  // Inactive items stay on file but are hidden from the order picker.
  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'int', nullable: true })
  serial: number | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
