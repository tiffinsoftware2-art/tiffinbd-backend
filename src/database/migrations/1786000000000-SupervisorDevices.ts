import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets branchless supervisors (SUPER_ADMIN / ADMIN / BUSINESS_HEAD / MANAGER)
 * hold an FCM device row, so escalation alerts can reach them when the app is
 * backgrounded or killed. See ADR-020.
 *
 * DATA SAFETY: this migration modifies no existing row. It only widens
 * `branch_id` to accept NULL — every current row has a non-null branch_id and
 * keeps it. Nothing is deleted, nothing is rewritten, no index is added.
 *
 * It deliberately does NOT add the missing `UNIQUE(user_id)` index that would
 * make `devices.repository.ts`'s `upsert(..., { conflictPaths: ['user_id'] })`
 * behave as an upsert. Creating that index requires deleting duplicate rows
 * first, and InitialSchema (1783000000000) already records that the index
 * "belongs in its own migration". Duplicates are instead neutralised at read
 * time: findOrderAlertTokens() and findEscalationAlertTokens() both select
 * DISTINCT tokens.
 */
export class SupervisorDevices1786000000000 implements MigrationInterface {
  name = 'SupervisorDevices1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `devices` MODIFY `branch_id` varchar(36) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only rows this migration made possible are removed. `branch_id` was NOT
    // NULL before it ran, so no row that predates it can be NULL here — this
    // cannot touch pre-existing data. Without it the MODIFY below would fail on
    // any supervisor device registered while the column was nullable.
    await queryRunner.query('DELETE FROM `devices` WHERE `branch_id` IS NULL');
    await queryRunner.query(
      'ALTER TABLE `devices` MODIFY `branch_id` varchar(36) NOT NULL',
    );
  }
}
