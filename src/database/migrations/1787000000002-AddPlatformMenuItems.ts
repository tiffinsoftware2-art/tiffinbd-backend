import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds platform_menu_items: a separate menu per delivery platform (Foodpanda,
 * Pathao, Foodi) with its own items and prices. Additive only: creates one new
 * table and touches nothing that exists. Safe to run on production; down()
 * drops the table (and the platform menu data in it).
 */
export class AddPlatformMenuItems1787000000002 implements MigrationInterface {
  name = 'AddPlatformMenuItems1787000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `platform_menu_items` (' +
        '`id` varchar(36) NOT NULL, ' +
        "`platform` enum ('FOODPANDA', 'PATHAO', 'FOODIE') NOT NULL, " +
        '`name` varchar(255) NOT NULL, ' +
        '`category` varchar(100) NULL, ' +
        '`price` decimal(10,2) NOT NULL, ' +
        '`is_active` tinyint NOT NULL DEFAULT 1, ' +
        '`serial` int NULL, ' +
        '`created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ' +
        '`updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ' +
        'UNIQUE INDEX `IDX_platform_menu_platform_name` (`platform`, `name`), ' +
        'PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX `IDX_platform_menu_platform_name` ON `platform_menu_items`',
    );
    await queryRunner.query('DROP TABLE `platform_menu_items`');
  }
}
