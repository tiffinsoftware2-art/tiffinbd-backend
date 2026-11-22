import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds orders.paymentMethod (how a paid order was paid). Additive: one new
 * nullable column, so every existing order simply has no method recorded.
 * down() drops the column.
 */
export class AddOrderPaymentMethod1787000000005 implements MigrationInterface {
  name = 'AddOrderPaymentMethod1787000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `orders` ADD `paymentMethod` enum ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'CARD', 'BANK', 'OTHER') NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `orders` DROP COLUMN `paymentMethod`');
  }
}
