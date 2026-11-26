import { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizePhone } from '../../common/utils/phone';

/**
 * Customers keyed by phone number.
 * - orders.customerPhone: the order's phone in the standard form (indexed),
 *   so the same customer is grouped together however the number was typed.
 * - customers: one row per phone (unique), with the latest name and address.
 * Both are filled from existing orders here. Additive: no existing column or
 * row is changed apart from setting the new customerPhone column.
 */
export class AddCustomers1787000000010 implements MigrationInterface {
  name = 'AddCustomers1787000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `orders` ADD `customerPhone` varchar(20) NULL DEFAULT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX `IDX_orders_customerPhone` ON `orders` (`customerPhone`)',
    );
    await queryRunner.query(`
      CREATE TABLE \`customers\` (
        \`id\` varchar(36) NOT NULL,
        \`phone\` varchar(20) NOT NULL,
        \`name\` varchar(255) NOT NULL DEFAULT '',
        \`address\` text NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        UNIQUE INDEX \`IDX_customers_phone\` (\`phone\`),
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB
    `);

    // Backfill, oldest first, so the latest non-blank name/address wins.
    const rows = (await queryRunner.query(
      'SELECT `id`, `customer` FROM `orders` ORDER BY `createdAt` ASC',
    )) as Array<{ id: string; customer: unknown }>;
    const latest = new Map<string, { name: string; address: string }>();
    for (const r of rows) {
      const c = (
        typeof r.customer === 'string' ? JSON.parse(r.customer) : r.customer
      ) as { phone?: unknown; name?: unknown; address?: unknown } | null;
      const phone = normalizePhone(c?.phone);
      if (!phone) continue;
      await queryRunner.query(
        'UPDATE `orders` SET `customerPhone` = ? WHERE `id` = ?',
        [phone, r.id],
      );
      const prev = latest.get(phone) ?? { name: '', address: '' };
      const rawName = typeof c?.name === 'string' ? c.name.trim() : '';
      // Placeholder names on platform orders ("Foodpanda customer") are not names.
      const name = / customer$/i.test(rawName) ? '' : rawName;
      const address = typeof c?.address === 'string' ? c.address.trim() : '';
      latest.set(phone, {
        name: name || prev.name,
        address: address || prev.address,
      });
    }
    for (const [phone, v] of latest) {
      await queryRunner.query(
        'INSERT INTO `customers` (`id`, `phone`, `name`, `address`) VALUES (UUID(), ?, ?, ?)',
        [phone, v.name.slice(0, 255), v.address || null],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `customers`');
    await queryRunner.query(
      'DROP INDEX `IDX_orders_customerPhone` ON `orders`',
    );
    await queryRunner.query('ALTER TABLE `orders` DROP COLUMN `customerPhone`');
  }
}
