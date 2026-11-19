import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCreatedByToOrders1783507009974 implements MigrationInterface {
    name = 'AddCreatedByToOrders1783507009974'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`orders\` ADD \`createdBy\` varchar(36) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`createdBy\``);
    }

}
