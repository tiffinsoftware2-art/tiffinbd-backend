import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Removes ChillyPOS from the schema.
 *
 * 1. `chilly_pos_id` -> `external_id` on branches, menu_categories and
 *    menu_items. RENAME, not DROP: the website still sends these ids on
 *    /api/v1/ingest/website, and TiffinBDAdapter / OrderRepository resolve
 *    menu items and branches through them. Values and uniqueness are kept.
 *
 * 2. Drops 'CHILLI_POS' from the `orders.source` and
 *    `ingestion_records.source_platform` enums.
 *    DATA CHANGE: existing orders with source 'CHILLI_POS' are rewritten to
 *    'OTHER' (the original platform label is not recoverable afterwards, see
 *    down()). The migration aborts if any ingestion_records row is
 *    'CHILLI_POS' (the ingest endpoint only ever writes WEBSITE, so none are
 *    expected) rather than guessing a replacement.
 *
 * manual_order_config.vatExcludedSources needs no change: unknown values in
 * that JSON are already ignored by parseVatExcludedSources(). Snapshots in
 * order_edit_history keep their historical 'CHILLI_POS' string; that is JSON,
 * not an enum, and is only displayed.
 *
 * TAKE A DATABASE BACKUP BEFORE RUNNING THIS ON PROD.
 */
export class RemoveChillyPos1787000000001 implements MigrationInterface {
  name = 'RemoveChillyPos1787000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const stray: Array<{ n: string }> = await queryRunner.query(
      "SELECT COUNT(*) AS n FROM `ingestion_records` WHERE `source_platform` = 'CHILLI_POS'",
    );
    if (Number(stray[0]?.n) > 0) {
      throw new Error(
        "ingestion_records contains 'CHILLI_POS' rows; resolve them manually before removing the enum value",
      );
    }

    for (const [table, oldIdx, newIdx, len, nullable] of [
      ['branches', 'IDX_branches_chilly_pos_id', 'IDX_branches_external_id', 100, true],
      ['menu_categories', 'IDX_menu_categories_chilly_pos_id', 'IDX_menu_categories_external_id', 100, false],
      ['menu_items', 'IDX_menu_items_chilly_pos_id', 'IDX_menu_items_external_id', 100, false],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` CHANGE \`chilly_pos_id\` \`external_id\` varchar(${len}) ${nullable ? 'NULL' : 'NOT NULL'}`,
      );
      // MySQL carries the index along with the column but keeps its old name.
      await queryRunner.query(
        `ALTER TABLE \`${table}\` RENAME INDEX \`${oldIdx}\` TO \`${newIdx}\``,
      );
    }

    await queryRunner.query(
      "UPDATE `orders` SET `source` = 'OTHER' WHERE `source` = 'CHILLI_POS'",
    );
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `source` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'WHATSAPP', 'PHONE', 'OTHER') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `ingestion_records` MODIFY `source_platform` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE') NOT NULL",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restores the schema only. Orders rewritten to 'OTHER' stay 'OTHER'.
    await queryRunner.query(
      "ALTER TABLE `ingestion_records` MODIFY `source_platform` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'CHILLI_POS') NOT NULL",
    );
    await queryRunner.query(
      "ALTER TABLE `orders` MODIFY `source` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'CHILLI_POS', 'WHATSAPP', 'PHONE', 'OTHER') NOT NULL",
    );

    for (const [table, oldIdx, newIdx, len, nullable] of [
      ['menu_items', 'IDX_menu_items_chilly_pos_id', 'IDX_menu_items_external_id', 100, false],
      ['menu_categories', 'IDX_menu_categories_chilly_pos_id', 'IDX_menu_categories_external_id', 100, false],
      ['branches', 'IDX_branches_chilly_pos_id', 'IDX_branches_external_id', 100, true],
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` RENAME INDEX \`${newIdx}\` TO \`${oldIdx}\``,
      );
      await queryRunner.query(
        `ALTER TABLE \`${table}\` CHANGE \`external_id\` \`chilly_pos_id\` varchar(${len}) ${nullable ? 'NULL' : 'NOT NULL'}`,
      );
    }
  }
}
