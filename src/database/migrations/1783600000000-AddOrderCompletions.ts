import { MigrationInterface, QueryRunner } from "typeorm";

// Order Completion — new order_completions table only. No columns are added
// to `orders` (see ADR-011: completion is deliberately NOT a nullable-column
// pattern like archivedAt/settledAt — it lives entirely in its own table).
export class AddOrderCompletions1783600000000 implements MigrationInterface {
    name = 'AddOrderCompletions1783600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`order_completions\` (\`id\` varchar(36) NOT NULL, \`orderId\` varchar(36) NOT NULL, \`completedBy\` varchar(36) NOT NULL, \`completedByRole\` enum ('SUPER_ADMIN', 'ADMIN', 'BUSINESS_HEAD', 'MANAGER', 'BRANCH_MANAGER', 'STAFF') NOT NULL, \`completedAt\` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), UNIQUE INDEX \`IDX_order_completions_orderId\` (\`orderId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX \`IDX_order_completions_orderId\` ON \`order_completions\``);
        await queryRunner.query(`DROP TABLE \`order_completions\``);
    }

}
