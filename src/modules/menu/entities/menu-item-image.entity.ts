import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// A photo uploaded from the dashboard for one menu item. Kept in its own table
// so the menu list queries never load image bytes. When a row exists, the
// website shows this photo instead of the item's image links.
@Entity('menu_item_images')
export class MenuItemImage {
  // Same value as menu_items.id (one photo per item).
  @PrimaryColumn({ type: 'varchar', length: 36 })
  menu_item_id: string;

  @Column({ type: 'mediumblob' })
  data: Buffer;

  @Column({ type: 'varchar', length: 50 })
  mime_type: string;

  @UpdateDateColumn({ precision: 3 })
  updated_at: Date;
}
