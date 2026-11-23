import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds menu_item_images: a photo uploaded from the dashboard for a menu item
 * (stored in the database, separate from menu_items so list queries stay
 * light). Additive: creates one new table and touches nothing that exists.
 * down() drops the table and the uploaded photos in it.
 */
export class AddMenuItemImages1787000000007 implements MigrationInterface {
  name = 'AddMenuItemImages1787000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `menu_item_images` (' +
        '`menu_item_id` varchar(36) NOT NULL, ' +
        '`data` mediumblob NOT NULL, ' +
        '`mime_type` varchar(50) NOT NULL, ' +
        '`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), ' +
        'PRIMARY KEY (`menu_item_id`)' +
        ') ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `menu_item_images`');
  }
}
