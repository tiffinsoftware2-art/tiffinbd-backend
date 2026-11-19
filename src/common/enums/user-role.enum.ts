export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  BUSINESS_HEAD = 'BUSINESS_HEAD',
  MANAGER = 'MANAGER',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  STAFF = 'STAFF',
}

export const ROLE_LEVEL: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 1,
  [UserRole.ADMIN]: 2,
  [UserRole.BUSINESS_HEAD]: 3,
  [UserRole.MANAGER]: 4,
  [UserRole.BRANCH_MANAGER]: 5,
  [UserRole.STAFF]: 6,
};

export function hasMinimumRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] <= ROLE_LEVEL[requiredRole];
}

export function canManageRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_LEVEL[actorRole] < ROLE_LEVEL[targetRole];
}

/**
 * Alerting tiers. Role decides which alert a device receives, and the three sets
 * are mutually exclusive and exhaustive over UserRole — see ADR-020.
 *
 *   ESCALATION_ALERT_ROLES   no order alert; a 20s dismiss-only alert when any
 *                            branch's order escalates.
 *   GLOBAL_ORDER_ALERT_ROLES the full order alarm for EVERY branch, no
 *                            escalation alert.
 *   everyone else            the full order alarm for their own branch only.
 *
 * Deliberately NOT expressed with `hasMinimumRole`. The split now runs between
 * BUSINESS_HEAD and MANAGER, which are adjacent in ROLE_LEVEL, so a seniority
 * test would look right and silently re-tier every role inserted between them
 * (as ADR-016 already did once). These are audience lists, not thresholds.
 *
 * Equally deliberately NOT compounded with `branch_id IS NULL`. Two sources of
 * truth for one fact can disagree; role is the single predicate.
 */
export const ESCALATION_ALERT_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.BUSINESS_HEAD,
];

/**
 * Roles that receive the ordinary order alarm for every branch rather than one.
 * They are branchless, so the branch-scoped token lookup cannot reach them;
 * `DevicesRepository.findOrderAlertTokens` unions them in explicitly.
 */
export const GLOBAL_ORDER_ALERT_ROLES: UserRole[] = [UserRole.MANAGER];

export function isEscalationAlertRole(role: UserRole): boolean {
  return ESCALATION_ALERT_ROLES.includes(role);
}

export function isGlobalOrderAlertRole(role: UserRole): boolean {
  return GLOBAL_ORDER_ALERT_ROLES.includes(role);
}
