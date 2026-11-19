import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVatExcludedSourcesToManualOrderConfig1785227909063 implements MigrationInterface {
    name = 'AddVatExcludedSourcesToManualOrderConfig1785227909063'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`manual_order_config\` ADD \`vatExcludedSources\` text NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`manual_order_config\` DROP COLUMN \`vatExcludedSources\``);
    }

}
