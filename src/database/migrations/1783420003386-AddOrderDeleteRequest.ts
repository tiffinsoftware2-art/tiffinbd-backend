import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOrderDeleteRequest1783420003386 implements MigrationInterface {
    name = 'AddOrderDeleteRequest1783420003386'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`order_delete_requests\` (\`id\` varchar(36) NOT NULL, \`orderId\` varchar(36) NOT NULL, \`requestedBy\` varchar(36) NOT NULL, \`requestedByRole\` enum ('SUPER_ADMIN', 'ADMIN', 'BUSINESS_HEAD', 'MANAGER', 'BRANCH_MANAGER', 'STAFF') NOT NULL, \`reason\` enum ('FAKE_ORDER', 'ITEM_NOT_AVAILABLE', 'CUSTOMER_UNREACHABLE', 'OTHER') NOT NULL, \`customReason\` varchar(500) NULL, \`status\` enum ('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING', \`reviewedBy\` varchar(36) NULL, \`reviewedAt\` datetime(3) NULL, \`reviewNote\` varchar(500) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_e532d1ce7b6a7e605dc847cdc8\` (\`status\`), INDEX \`IDX_1ccbb804996d4a3c6c770564ed\` (\`orderId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`orders\` ADD \`archivedAt\` datetime(3) NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` ADD \`archivedBy\` varchar(36) NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` ADD \`archiveReason\` enum ('FAKE_ORDER', 'ITEM_NOT_AVAILABLE', 'CUSTOMER_UNREACHABLE', 'OTHER') NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` ADD \`archiveReasonNote\` varchar(500) NULL`);
        await queryRunner.query(`ALTER TABLE \`manual_order_config\` ADD \`deliveryCharge\` decimal(10,2) NOT NULL DEFAULT '27.00'`);
        await queryRunner.query(`ALTER TABLE \`manual_order_config\` ADD \`platformFee\` decimal(10,2) NOT NULL DEFAULT '3.00'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`manual_order_config\` DROP COLUMN \`platformFee\``);
        await queryRunner.query(`ALTER TABLE \`manual_order_config\` DROP COLUMN \`deliveryCharge\``);
        await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`archiveReasonNote\``);
        await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`archiveReason\``);
        await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`archivedBy\``);
        await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`archivedAt\``);
        await queryRunner.query(`DROP INDEX \`IDX_1ccbb804996d4a3c6c770564ed\` ON \`order_delete_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_e532d1ce7b6a7e605dc847cdc8\` ON \`order_delete_requests\``);
        await queryRunner.query(`DROP TABLE \`order_delete_requests\``);
    }

}
