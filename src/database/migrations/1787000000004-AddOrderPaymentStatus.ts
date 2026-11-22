import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds orders.paymentStatus (PAID | DUE). Additive: one new column whose
 * default is PAID, so every existing order stays "paid" and nothing about them
 * changes. down() drops the column.
 */
export class AddOrderPaymentStatus1787000000004 implements MigrationInterface {
  name = 'AddOrderPaymentStatus1787000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `orders` ADD `paymentStatus` enum ('PAID', 'DUE') NOT NULL DEFAULT 'PAID'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `orders` DROP COLUMN `paymentStatus`');
  }
}
