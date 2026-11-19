import {
  UserRole,
  ESCALATION_ALERT_ROLES,
  GLOBAL_ORDER_ALERT_ROLES,
  isEscalationAlertRole,
  isGlobalOrderAlertRole,
} from './user-role.enum';

describe('alerting tiers', () => {
  it('gives escalation alerts to the three oversight roles', () => {
    expect(isEscalationAlertRole(UserRole.SUPER_ADMIN)).toBe(true);
    expect(isEscalationAlertRole(UserRole.ADMIN)).toBe(true);
    expect(isEscalationAlertRole(UserRole.BUSINESS_HEAD)).toBe(true);
  });

  it('gives MANAGER all-branch order alerts, not escalation alerts', () => {
    expect(isGlobalOrderAlertRole(UserRole.MANAGER)).toBe(true);
    expect(isEscalationAlertRole(UserRole.MANAGER)).toBe(false);
  });

  it('leaves branch-scoped roles in neither set', () => {
    for (const role of [UserRole.BRANCH_MANAGER, UserRole.STAFF]) {
      expect(isEscalationAlertRole(role)).toBe(false);
      expect(isGlobalOrderAlertRole(role)).toBe(false);
    }
  });

  // The partition is the whole contract: every role lands in exactly one tier,
  // so adding a role to the enum without choosing a tier fails here rather than
  // silently defaulting it to branch-scoped alerts.
  it('partitions every role into exactly one tier', () => {
    const all = Object.values(UserRole);
    const overlap = all.filter((r) => isEscalationAlertRole(r) && isGlobalOrderAlertRole(r));
    expect(overlap).toEqual([]);

    const branchScoped = all.filter((r) => !isEscalationAlertRole(r) && !isGlobalOrderAlertRole(r));
    expect(branchScoped).toEqual([UserRole.BRANCH_MANAGER, UserRole.STAFF]);
  });

  it('lists each tier in seniority order for readability', () => {
    expect(ESCALATION_ALERT_ROLES).toEqual([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.BUSINESS_HEAD,
    ]);
    expect(GLOBAL_ORDER_ALERT_ROLES).toEqual([UserRole.MANAGER]);
  });
});
