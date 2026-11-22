import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds PHYSICAL_STORE as an order source and as a platform that can have its
 * own menu. Additive: the new value is appended at the END of each enum, so no
 * existing row or value changes. down() removes it again, but fails if an order
 * or menu item already uses it (by design: it never deletes data).
 */
export class AddPhysicalStorePlatform1787000000003 implements MigrationInterface {
  name = 'AddPhysicalStorePlatform1787000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `source` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'WHATSAPP', 'PHONE', 'OTHER', 'PHYSICAL_STORE') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `platform_menu_items` MODIFY `platform` enum ('FOODPANDA', 'PATHAO', 'FOODIE', 'PHYSICAL_STORE') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `platform_menu_items` MODIFY `platform` enum ('FOODPANDA', 'PATHAO', 'FOODIE') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `source` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'WHATSAPP', 'PHONE', 'OTHER') NOT NULL",
    );
  }
}
