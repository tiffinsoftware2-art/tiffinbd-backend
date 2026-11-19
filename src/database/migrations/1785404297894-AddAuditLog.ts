import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAuditLog1785404297894 implements MigrationInterface {
    name = 'AddAuditLog1785404297894'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`audit_log\` (\`id\` varchar(36) NOT NULL, \`actor_user_id\` varchar(36) NULL, \`actor_username\` varchar(100) NULL, \`actor_role\` enum('SUPER_ADMIN','ADMIN','BUSINESS_HEAD','MANAGER','BRANCH_MANAGER','STAFF') NULL, \`actor_branch_id\` varchar(36) NULL, \`action\` varchar(100) NOT NULL, \`entity_type\` varchar(50) NULL, \`entity_id\` varchar(36) NULL, \`method\` varchar(10) NOT NULL, \`path\` varchar(255) NOT NULL, \`status_code\` smallint NOT NULL, \`outcome\` enum('SUCCESS','FAILURE') NOT NULL, \`payload\` json NULL, \`ip_address\` varchar(45) NULL, \`user_agent\` varchar(255) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_audit_created\` (\`created_at\`), INDEX \`IDX_audit_entity\` (\`entity_type\`, \`entity_id\`), INDEX \`IDX_audit_action_created\` (\`action\`, \`created_at\`), INDEX \`IDX_audit_actor_created\` (\`actor_user_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_audit_actor_created\` ON \`audit_log\``);
        await queryRunner.query(`DROP INDEX \`IDX_audit_action_created\` ON \`audit_log\``);
        await queryRunner.query(`DROP INDEX \`IDX_audit_entity\` ON \`audit_log\``);
        await queryRunner.query(`DROP INDEX \`IDX_audit_created\` ON \`audit_log\``);
        await queryRunner.query(`DROP TABLE \`audit_log\``);
    }

}
