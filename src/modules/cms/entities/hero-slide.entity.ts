import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One image in the website's hero slider. Managed from the dashboard's Website
// CMS page (Super Admin). Shown in sort_order, looping.
@Entity('site_hero_slides')
export class HeroSlide {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Image bytes; never selected by list queries (select: false).
  @Column({ type: 'mediumblob', select: false })
  data: Buffer;

  @Column({ type: 'varchar', length: 50 })
  mime_type: string;

  // Describes the image for screen readers and search engines.
  @Column({ type: 'varchar', length: 255, default: '' })
  alt: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
