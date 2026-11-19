import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginAudit, LoginResult } from './entities/login-audit.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';

@Injectable()
export class AuthRepository {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(LoginAudit)
    private readonly loginAudit: Repository<LoginAudit>,
  ) {}

  findUserByUsername(username: string): Promise<User | null> {
    return this.users.findOne({ where: { username, is_active: true } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id, is_active: true } });
  }

  async saveRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.refreshTokens.save({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
  }

  findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokens.findOne({ where: { token_hash: tokenHash } });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.refreshTokens.update({ token_hash: tokenHash }, { is_revoked: true });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokens.update({ user_id: userId, is_revoked: false }, { is_revoked: true });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.users.update(
      { id: userId },
      { password_hash: passwordHash, must_change_password: false },
    );
  }

  findLoginActivityByUserId(userId: string, limit: number): Promise<LoginAudit[]> {
    return this.loginAudit.find({
      where: { user_id: userId },
      order: { attempted_at: 'DESC' },
      take: limit,
    });
  }

  async logLoginAttempt(
    userId: string | null,
    username: string,
    result: LoginResult,
    ipAddress: string,
    failureReason?: string,
  ): Promise<void> {
    await this.loginAudit.save({
      user_id: userId,
      username,
      result,
      ip_address: ipAddress,
      failure_reason: failureReason ?? null,
    });
  }
}
