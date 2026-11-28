import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `addons` table (dashboard add-on menu). Purely additive: one new
 * table, nothing existing is altered, so it cannot affect orders, the menu
 * feed or the mobile app.
 */
export class AddAddons1787000000002 implements MigrationInterface {
  name = 'AddAddons1787000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `addons` (' +
        '`id` varchar(36) NOT NULL, ' +
        '`name` varchar(255) NOT NULL, ' +
        '`price` decimal(10,2) NOT NULL, ' +
        '`is_active` tinyint NOT NULL DEFAULT 1, ' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `addons`');
  }
}
