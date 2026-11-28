import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// An add-on is a small extra (sauce, drink, extra patty…) that staff can attach
// to an order from the dashboard's order detail view. It is a standalone list —
// NOT part of menu_items — so it never appears on the website menu feed.
//
// When staff add one to an order, the order stores a plain item line copied
// from it (name, quantity, price), so renaming or deleting an add-on later
// never changes an existing order.
@Entity('addons')
export class Addon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  // Inactive add-ons stay in the list but cannot be added to orders.
  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
