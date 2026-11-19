import { Injectable } from '@nestjs/common';
import { DevicesRepository } from './devices.repository';

@Injectable()
export class DevicesService {
  constructor(private readonly repo: DevicesRepository) {}

  async register(
    userId: string,
    branchId: string | null,
    fcmToken: string,
  ): Promise<void> {
    await this.repo.upsertToken(userId, branchId, fcmToken);
  }

  async unregister(userId: string): Promise<void> {
    await this.repo.deleteByUserId(userId);
  }

  /**
   * Order-alert audience for a branch: that branch's devices plus the roles
   * alerted for every branch (ADR-020). Used for both the created push and the
   * stop push, which is what keeps the two symmetric.
   */
  async getOrderAlertTokens(branchId: string): Promise<string[]> {
    return this.repo.findOrderAlertTokens(branchId);
  }

  /** Escalation-alert audience — every active oversight role, all branches (ADR-020). */
  async getEscalationAlertTokens(): Promise<string[]> {
    return this.repo.findEscalationAlertTokens();
  }

  async removeExpiredToken(fcmToken: string): Promise<void> {
    await this.repo.deleteByToken(fcmToken);
  }
}
