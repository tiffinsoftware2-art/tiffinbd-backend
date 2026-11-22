import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds orders.platformOrderId: the order number a delivery platform (Foodpanda,
 * Pathao, Foodi) gave the order, typed in by staff so it can be searched later.
 * Additive: one nullable column plus an index; existing orders have none.
 * down() drops both.
 */
export class AddPlatformOrderId1787000000006 implements MigrationInterface {
  name = 'AddPlatformOrderId1787000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `orders` ADD `platformOrderId` varchar(100) NULL');
    await queryRunner.query(
      'CREATE INDEX `IDX_orders_source_platformOrderId` ON `orders` (`source`, `platformOrderId`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_orders_source_platformOrderId` ON `orders`');
    await queryRunner.query('ALTER TABLE `orders` DROP COLUMN `platformOrderId`');
  }
}
