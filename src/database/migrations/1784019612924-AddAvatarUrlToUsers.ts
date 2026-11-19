import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAvatarUrlToUsers1784019612924 implements MigrationInterface {
    name = 'AddAvatarUrlToUsers1784019612924'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` ADD \`avatar_url\` varchar(255) NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`avatar_url\``);
    }

}
