import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema — the 13 tables that existed before the first incremental
 * migration (1783420003386-AddOrderDeleteRequest).
 *
 * Why this file exists: the original schema was created by `synchronize: true`,
 * which was switched off for good in ADR-008. Every migration written since is
 * incremental (`ALTER TABLE orders ...`), so a database created from nothing had
 * no `orders` table for them to alter — `migration:run` failed on the first
 * ALTER and the backend crash-looped. That made `docker compose down -v`
 * unrecoverable and blocked standing up any fresh environment from the repo.
 *
 * Deliberately reproduces the *pre-migration* state, not the current one. The
 * six existing migrations then apply on top exactly as they always have:
 *   AddOrderDeleteRequest   → order_delete_requests, orders.archived*,
 *                             manual_order_config.deliveryCharge/platformFee
 *   AddCreatedByToOrders    → orders.createdBy
 *   AddOrderCompletions     → order_completions
 *   AddAvatarUrlToUsers     → users.avatar_url
 *   AddVatExcludedSources   → manual_order_config.vatExcludedSources
 *   AddAuditLog             → audit_log
 *
 * On databases that already exist (prod, and any dev DB predating this file),
 * the schema is already past this point, so `up()` detects that and no-ops —
 * TypeORM still records the migration as applied. That guard is deliberate: it
 * makes the deploy order irrelevant. Without it, deploying this file before
 * hand-inserting a row into `migrations` would run `CREATE TABLE users` against
 * a live database, fail, and crash-loop the container.
 */
export class InitialSchema1783000000000 implements MigrationInterface {
  name = 'InitialSchema1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-existing database (prod, or any dev DB created under synchronize).
    // Its schema is already at or beyond this point — record this migration as
    // applied and change nothing. Only a genuinely empty database falls through.
    if (await queryRunner.hasTable('users')) {
      return;
    }

    await queryRunner.query(
      `CREATE TABLE \`users\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`name\` varchar(255) NULL, ` +
        `\`username\` varchar(100) NOT NULL, ` +
        `\`password_hash\` varchar(255) NOT NULL, ` +
        `\`role\` enum ('SUPER_ADMIN', 'ADMIN', 'BUSINESS_HEAD', 'MANAGER', 'BRANCH_MANAGER', 'STAFF') NOT NULL, ` +
        `\`branch_id\` varchar(36) NULL, ` +
        `\`must_change_password\` tinyint NOT NULL DEFAULT 0, ` +
        `\`is_active\` tinyint NOT NULL DEFAULT 1, ` +
        `\`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`IDX_users_username\` (\`username\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`refresh_tokens\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`user_id\` varchar(36) NOT NULL, ` +
        `\`token_hash\` varchar(255) NOT NULL, ` +
        `\`expires_at\` datetime NOT NULL, ` +
        `\`is_revoked\` tinyint NOT NULL DEFAULT 0, ` +
        `\`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `INDEX \`IDX_refresh_tokens_user_id\` (\`user_id\`), ` +
        `UNIQUE INDEX \`IDX_refresh_tokens_token_hash\` (\`token_hash\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`login_audit\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`user_id\` varchar(36) NULL, ` +
        `\`username\` varchar(100) NOT NULL, ` +
        `\`result\` enum ('SUCCESS', 'FAILURE') NOT NULL, ` +
        `\`failure_reason\` varchar(255) NULL, ` +
        `\`ip_address\` varchar(45) NOT NULL, ` +
        `\`attempted_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `INDEX \`IDX_login_audit_username\` (\`username\`), ` +
        `INDEX \`IDX_login_audit_ip_address\` (\`ip_address\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`branches\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`name\` varchar(255) NOT NULL, ` +
        `\`address\` text NULL, ` +
        `\`phone\` varchar(50) NULL, ` +
        `\`chilly_pos_id\` varchar(100) NULL, ` +
        `\`is_active\` tinyint NOT NULL DEFAULT 1, ` +
        `\`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`IDX_branches_chilly_pos_id\` (\`chilly_pos_id\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`menu_categories\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`chilly_pos_id\` varchar(100) NOT NULL, ` +
        `\`name\` varchar(255) NOT NULL, ` +
        `\`score\` int NOT NULL DEFAULT 0, ` +
        `\`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`IDX_menu_categories_chilly_pos_id\` (\`chilly_pos_id\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`menu_items\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`chilly_pos_id\` varchar(100) NOT NULL, ` +
        `\`name\` varchar(255) NOT NULL, ` +
        `\`price\` decimal(10,2) NOT NULL, ` +
        `\`description\` text NULL, ` +
        `\`images\` text NULL, ` +
        `\`is_popular\` tinyint NOT NULL DEFAULT 0, ` +
        `\`vat_inclusive\` tinyint NOT NULL DEFAULT 0, ` +
        `\`sc_inclusive\` tinyint NOT NULL DEFAULT 0, ` +
        `\`is_never_kot\` tinyint NOT NULL DEFAULT 0, ` +
        `\`is_no_discount\` tinyint NOT NULL DEFAULT 0, ` +
        `\`serial\` int NULL, ` +
        `\`category_id\` varchar(36) NULL, ` +
        `\`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `UNIQUE INDEX \`IDX_menu_items_chilly_pos_id\` (\`chilly_pos_id\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`ingestion_records\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`external_order_id\` varchar(255) NOT NULL, ` +
        `\`source_platform\` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'CHILLI_POS') NOT NULL, ` +
        `\`pipeline_status\` enum ('RECEIVED', 'VALIDATING', 'VALIDATED', 'CANCELLED') NOT NULL DEFAULT 'RECEIVED', ` +
        `\`cancel_reason\` varchar(255) NULL DEFAULT NULL, ` +
        `\`raw_payload\` json NOT NULL, ` +
        `\`normalized_payload\` json NULL DEFAULT NULL, ` +
        `\`app_order_id\` varchar(36) NULL DEFAULT NULL, ` +
        `\`source_ip\` varchar(45) NULL DEFAULT NULL, ` +
        `\`received_at\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ` +
        `\`validated_at\` datetime(3) NULL DEFAULT NULL, ` +
        `\`forwarded_at\` datetime(3) NULL DEFAULT NULL, ` +
        `INDEX \`IDX_ingestion_records_pipeline_status\` (\`pipeline_status\`), ` +
        `INDEX \`IDX_ingestion_records_received_at\` (\`received_at\`), ` +
        `UNIQUE INDEX \`IDX_ingestion_records_external_source\` (\`external_order_id\`, \`source_platform\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`orders\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`externalId\` varchar(100) NOT NULL, ` +
        `\`source\` enum ('WEBSITE', 'FOODPANDA', 'PATHAO', 'FOODIE', 'CHILLI_POS', 'WHATSAPP', 'PHONE', 'OTHER') NOT NULL, ` +
        `\`orderType\` enum ('DELIVERY', 'PICKUP', 'DINE_IN') NOT NULL, ` +
        `\`status\` enum ('PENDING', 'ACCEPTED', 'ESCALATED') NOT NULL DEFAULT 'PENDING', ` +
        `\`branchId\` varchar(36) NULL, ` +
        `\`customer\` json NOT NULL, ` +
        `\`items\` json NOT NULL, ` +
        `\`totalAmount\` decimal(10,2) NOT NULL, ` +
        `\`rawPayload\` json NOT NULL, ` +
        `\`acceptedBy\` varchar(36) NULL, ` +
        `\`acceptedAt\` datetime(3) NULL DEFAULT NULL, ` +
        `\`escalatedAt\` datetime(3) NULL DEFAULT NULL, ` +
        `\`settledAt\` datetime(3) NULL DEFAULT NULL, ` +
        `\`settledBy\` varchar(36) NULL, ` +
        `\`settlementNote\` varchar(1000) NULL, ` +
        `\`isUpdated\` tinyint NOT NULL DEFAULT 0, ` +
        `\`productSubtotal\` decimal(10,2) NULL, ` +
        `\`vatPercent\` decimal(5,2) NULL, ` +
        `\`vatAmount\` decimal(10,2) NULL, ` +
        `\`deliveryCharge\` decimal(10,2) NULL, ` +
        `\`platformFee\` decimal(10,2) NULL, ` +
        `\`discountType\` enum ('percentage', 'fixed') NULL, ` +
        `\`discountValue\` decimal(10,2) NULL, ` +
        `\`discountAmount\` decimal(10,2) NULL, ` +
        `\`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), ` +
        `\`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `INDEX \`IDX_orders_status\` (\`status\`), ` +
        `INDEX \`IDX_orders_branchId\` (\`branchId\`), ` +
        `INDEX \`IDX_orders_createdAt\` (\`createdAt\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`order_history\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`orderId\` varchar(36) NOT NULL, ` +
        `\`status\` enum ('PENDING', 'ACCEPTED', 'ESCALATED') NOT NULL, ` +
        `\`changedBy\` varchar(36) NULL, ` +
        `\`note\` varchar(255) NULL, ` +
        `\`changedAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ` +
        `INDEX \`IDX_order_history_orderId\` (\`orderId\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`order_edit_history\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`orderId\` varchar(36) NOT NULL, ` +
        `\`editedBy\` varchar(36) NULL, ` +
        `\`previousSnapshot\` json NOT NULL, ` +
        `\`editedAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), ` +
        `INDEX \`IDX_order_edit_history_orderId\` (\`orderId\`), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    // NOTE: no unique index on `user_id`, faithfully matching the schema that
    // synchronize produced. devices.repository.ts calls
    // `upsert(..., { conflictPaths: ['user_id'] })`, which silently degrades to
    // a plain INSERT without one, leaving duplicate stale rows per user. That is
    // a real defect, but fixing it here would make this file diverge from the
    // databases it is meant to reproduce — it belongs in its own migration.
    await queryRunner.query(
      `CREATE TABLE \`devices\` (` +
        `\`id\` varchar(36) NOT NULL, ` +
        `\`user_id\` varchar(36) NOT NULL, ` +
        `\`branch_id\` varchar(36) NOT NULL, ` +
        `\`fcm_token\` varchar(500) NOT NULL, ` +
        `\`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`escalation_config\` (` +
        `\`id\` int NOT NULL, ` +
        `\`enabled\` tinyint NOT NULL DEFAULT 0, ` +
        `\`smtpHost\` varchar(255) NULL, ` +
        `\`smtpPort\` int NOT NULL DEFAULT 587, ` +
        `\`smtpSecure\` tinyint NOT NULL DEFAULT 0, ` +
        `\`smtpUser\` varchar(255) NULL, ` +
        `\`smtpPass\` varchar(255) NULL, ` +
        `\`fromEmail\` varchar(255) NULL, ` +
        `\`fromName\` varchar(255) NOT NULL DEFAULT 'TiffinBD', ` +
        `\`recipients\` text NULL, ` +
        `\`subjectTemplate\` varchar(500) NOT NULL DEFAULT '[TiffinBD] Order Escalated: #{{externalId}}', ` +
        `\`bodyTemplate\` text NULL, ` +
        `\`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    await queryRunner.query(
      `CREATE TABLE \`manual_order_config\` (` +
        `\`id\` int NOT NULL, ` +
        `\`vatPercent\` decimal(5,2) NOT NULL DEFAULT '0.00', ` +
        `\`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), ` +
        `PRIMARY KEY (\`id\`)` +
        `) ENGINE=InnoDB`,
    );

    // The only foreign key in the whole schema (menu-item.entity.ts:50).
    await queryRunner.query(
      `ALTER TABLE \`menu_items\` ADD CONSTRAINT \`FK_menu_items_category_id\` ` +
        `FOREIGN KEY (\`category_id\`) REFERENCES \`menu_categories\`(\`id\`) ` +
        `ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`menu_items\` DROP FOREIGN KEY \`FK_menu_items_category_id\``,
    );
    await queryRunner.query(`DROP TABLE \`manual_order_config\``);
    await queryRunner.query(`DROP TABLE \`escalation_config\``);
    await queryRunner.query(`DROP TABLE \`devices\``);
    await queryRunner.query(`DROP TABLE \`order_edit_history\``);
    await queryRunner.query(`DROP TABLE \`order_history\``);
    await queryRunner.query(`DROP TABLE \`orders\``);
    await queryRunner.query(`DROP TABLE \`ingestion_records\``);
    await queryRunner.query(`DROP TABLE \`menu_items\``);
    await queryRunner.query(`DROP TABLE \`menu_categories\``);
    await queryRunner.query(`DROP TABLE \`branches\``);
    await queryRunner.query(`DROP TABLE \`login_audit\``);
    await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
