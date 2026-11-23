import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds TIFFIN_TAKEAWAY and STAFF as order sources and as platforms that can
 * have their own menu. Additive: the new values are appended at the END of each
 * enum, so no existing row or value changes. down() removes them again, but
 * fails if an order or menu item already uses one (by design: it never deletes
 * data).
 */
export class AddTakeawayAndStaffPlatforms1787000000008 implements MigrationInterface {
  name = 'AddTakeawayAndStaffPlatforms1787000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `source` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'WHATSAPP', 'PHONE', 'OTHER', 'PHYSICAL_STORE', 'TIFFIN_TAKEAWAY', 'STAFF') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `platform_menu_items` MODIFY `platform` enum ('FOODPANDA', 'PATHAO', 'FOODIE', 'PHYSICAL_STORE', 'TIFFIN_TAKEAWAY', 'STAFF') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `platform_menu_items` MODIFY `platform` enum ('FOODPANDA', 'PATHAO', 'FOODIE', 'PHYSICAL_STORE') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `source` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'WHATSAPP', 'PHONE', 'OTHER', 'PHYSICAL_STORE') NOT NULL",
    );
  }
}
