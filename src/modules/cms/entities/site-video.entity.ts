import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// One YouTube video in the website's "Our Recent Events" section. Managed from
// the dashboard's Website CMS page (Super Admin). Shown in sort_order.
@Entity('site_videos')
export class SiteVideo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The 11-character YouTube video ID, taken from whatever link was pasted.
  @Column({ type: 'varchar', length: 20 })
  youtube_id: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  title: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ precision: 3 })
  created_at: Date;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
