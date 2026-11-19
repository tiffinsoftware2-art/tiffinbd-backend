import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from './entities/device.entity';
import {
  ESCALATION_ALERT_ROLES,
  GLOBAL_ORDER_ALERT_ROLES,
} from '../../common/enums/user-role.enum';

@Injectable()
export class DevicesRepository {
  constructor(
    @InjectRepository(Device)
    private readonly repo: Repository<Device>,
  ) {}

  async upsertToken(
    userId: string,
    branchId: string | null,
    fcmToken: string,
  ): Promise<void> {
    await this.repo.upsert(
      { user_id: userId, branch_id: branchId, fcm_token: fcmToken },
      { conflictPaths: ['user_id'], skipUpdateIfNoValuesChanged: true },
    );
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.repo.delete({ user_id: userId });
  }

  /**
   * Every device that should ring for an order in this branch: the branch's own
   * devices, plus the branchless roles that are alerted for all branches
   * (GLOBAL_ORDER_ALERT_ROLES — currently MANAGER). See ADR-020.
   *
   * This is deliberately ONE query rather than a second endpoint unioned in by
   * the caller. Both the created push and the STOP push go through it, so the
   * two stay symmetric by construction — a global-order device that can be told
   * to start ringing is always also told to stop. Splitting them is how you get
   * a phone ringing for an order somebody already accepted (the ADR-015 bug).
   *
   * LEFT JOIN, not INNER: `devices` has no foreign key on `user_id`, so a row
   * whose user no longer resolves would be dropped by an inner join and would
   * silently stop receiving its branch's alerts. With LEFT JOIN such a row still
   * satisfies the branch arm, which makes the branch-scoped behaviour identical
   * to the pre-ADR-020 query no matter what is in the table.
   *
   * DISTINCT because `devices` has no UNIQUE(user_id), so
   * `upsert(conflictPaths: ['user_id'])` has been running as a plain INSERT and
   * a user may hold several rows carrying the same token.
   */
  async findOrderAlertTokens(branchId: string): Promise<string[]> {
    const qb = this.repo
      .createQueryBuilder('d')
      .leftJoin('users', 'u', 'u.id = d.user_id')
      .where('d.branch_id = :branchId', { branchId });

    // Guard the empty case: `IN ()` is not valid SQL, so emptying the list for a
    // staged rollout must degrade to plain branch-scoped alerting, not a crash.
    if (GLOBAL_ORDER_ALERT_ROLES.length > 0) {
      qb.orWhere('(u.role IN (:...globalRoles) AND u.is_active = :active)', {
        globalRoles: GLOBAL_ORDER_ALERT_ROLES,
        active: true,
      });
    }

    const rows = await qb
      .select('DISTINCT d.fcm_token', 'fcm_token')
      .getRawMany<{ fcm_token: string }>();
    return rows.map((r) => r.fcm_token);
  }

  /**
   * FCM tokens for every active escalation-alert role, across all branches —
   * the audience for the 20s escalation alert (ADR-020).
   *
   * Joined against `users.role` because role is the predicate and a device row
   * carries no role of its own. `is_active` is checked here so deactivating a
   * user stops their alerts even if their device row outlives the deactivation.
   */
  async findEscalationAlertTokens(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('d')
      .innerJoin('users', 'u', 'u.id = d.user_id')
      .where('u.role IN (:...roles)', { roles: ESCALATION_ALERT_ROLES })
      .andWhere('u.is_active = :active', { active: true })
      .select('DISTINCT d.fcm_token', 'fcm_token')
      .getRawMany<{ fcm_token: string }>();
    return rows.map((r) => r.fcm_token);
  }

  async deleteByToken(fcmToken: string): Promise<void> {
    await this.repo.delete({ fcm_token: fcmToken });
  }
}
