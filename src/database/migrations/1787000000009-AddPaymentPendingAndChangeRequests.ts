import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payment is now chosen when an order is completed or settled:
 * - orders.paymentStatus gains PENDING (appended), and new orders default to
 *   it. Existing orders keep the value they already have.
 * - New table payment_change_requests: Manager / Branch Manager / Staff ask to
 *   change a recorded payment; Admin+ approves or rejects.
 * down() turns PENDING orders back into PAID (the old default) and drops the table.
 */
export class AddPaymentPendingAndChangeRequests1787000000009 implements MigrationInterface {
  name = 'AddPaymentPendingAndChangeRequests1787000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `paymentStatus` enum ('PAID', 'DUE', 'PENDING') NOT NULL DEFAULT 'PENDING'",
    );
    await queryRunner.query(`
      CREATE TABLE \`payment_change_requests\` (
        \`id\` varchar(36) NOT NULL,
        \`orderId\` varchar(36) NOT NULL,
        \`requestedBy\` varchar(36) NOT NULL,
        \`fromStatus\` enum ('PAID', 'DUE', 'PENDING') NOT NULL,
        \`fromMethod\` enum ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'CARD', 'BANK', 'OTHER') NULL DEFAULT NULL,
        \`toStatus\` enum ('PAID', 'DUE', 'PENDING') NOT NULL,
        \`toMethod\` enum ('CASH', 'BKASH', 'NAGAD', 'ROCKET', 'CARD', 'BANK', 'OTHER') NULL DEFAULT NULL,
        \`reason\` varchar(500) NOT NULL,
        \`status\` enum ('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        \`reviewedBy\` varchar(36) NULL DEFAULT NULL,
        \`reviewedAt\` datetime(3) NULL DEFAULT NULL,
        \`reviewNote\` varchar(500) NULL DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX \`IDX_pcr_orderId\` (\`orderId\`),
        INDEX \`IDX_pcr_status\` (\`status\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `payment_change_requests`');
    await queryRunner.query(
      "UPDATE `orders` SET `paymentStatus` = 'PAID' WHERE `paymentStatus` = 'PENDING'",
    );
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `paymentStatus` enum ('PAID', 'DUE') NOT NULL DEFAULT 'PAID'",
    );
  }
}
