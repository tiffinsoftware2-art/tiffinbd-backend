import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthRepository } from './auth.repository';
import { LoginAudit } from './entities/login-audit.entity';
import { User, UserRole } from './entities/user.entity';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  branchId: string | null;
  must_change_password: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.repo.findUserByUsername(username);
    if (!user) return null;
    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) return null;
    if (!user.is_active) {
      this.logger.warn({
        message: 'Blocked user attempted login',
        service: 'tiffinbd-backend',
        context: 'AuthService',
        userId: user.id,
        username: user.username,
      });
      return null;
    }
    return user;
  }

  async login(user: User, ipAddress: string): Promise<AuthTokens> {
    const tokens = await this.issueTokens(user);

    this.logger.log({
      message: 'User logged in',
      service: 'tiffinbd-backend',
      context: 'AuthService',
      userId: user.id,
      role: user.role,
    });

    await this.repo.logLoginAttempt(user.id, user.username, 'SUCCESS', ipAddress);

    return tokens;
  }

  async loginFailed(username: string, ipAddress: string, reason: string): Promise<void> {
    await this.repo.logLoginAttempt(null, username, 'FAILURE', ipAddress, reason);
  }

  async refresh(rawToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.repo.findRefreshToken(tokenHash);

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (stored.is_revoked) {
      // Replay of a revoked token — breach detected; wipe all sessions
      this.logger.warn({
        message: 'Refresh token replay detected — revoking all sessions',
        service: 'tiffinbd-backend',
        context: 'AuthService',
        userId: stored.user_id,
      });
      await this.repo.revokeAllUserRefreshTokens(stored.user_id);
      throw new UnauthorizedException('Session invalidated');
    }

    if (stored.expires_at < new Date()) {
      await this.repo.revokeRefreshToken(tokenHash);
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.repo.findUserById(stored.user_id);
    if (!user) {
      await this.repo.revokeRefreshToken(tokenHash);
      throw new UnauthorizedException('User not found');
    }

    if (!user.is_active) {
      await this.repo.revokeRefreshToken(tokenHash);
      this.logger.warn({
        message: 'Blocked user attempted token refresh — session revoked',
        service: 'tiffinbd-backend',
        context: 'AuthService',
        userId: user.id,
        username: user.username,
      });
      throw new UnauthorizedException('Account is not active');
    }

    // Rotate: revoke old, issue new
    await this.repo.revokeRefreshToken(tokenHash);
    return this.issueTokens(user);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthTokens> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const matches = await bcrypt.compare(currentPassword, user.password_hash);
    if (!matches) throw new BadRequestException('Current password is incorrect');

    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must differ from current password');
    }

    const saltRounds = this.config.get<number>('app.bcryptRounds') ?? 12;
    const newHash = await bcrypt.hash(newPassword, saltRounds);

    await this.repo.updatePassword(userId, newHash);

    // Revoke all existing sessions so other clients are signed out
    await this.repo.revokeAllUserRefreshTokens(userId);

    // Mutate the already-loaded entity rather than re-fetching: TypeORM's
    // identity map can return a stale cached copy after a raw .update() call,
    // which would produce a new JWT that still has must_change_password = true.
    user.must_change_password = false;
    return this.issueTokens(user);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.repo.revokeAllUserRefreshTokens(userId);
  }

  async getLoginActivity(userId: string, limit: number): Promise<LoginAudit[]> {
    return this.repo.findLoginActivityByUserId(userId, limit);
  }

  async logout(userId: string, rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.repo.revokeRefreshToken(tokenHash);

    this.logger.log({
      message: 'User logged out',
      service: 'tiffinbd-backend',
      context: 'AuthService',
      userId,
    });
  }

  // Does a real DB read rather than echoing the JWT payload, so
  // must_change_password reflects current database state rather than a
  // possibly-stale token claim. Retained deliberately when the avatar
  // feature was removed — see ADR-018.
  async getMe(userId: string): Promise<{
    userId: string;
    username: string;
    role: UserRole;
    branchId: string | null;
    must_change_password: boolean;
  }> {
    const user = await this.repo.findUserById(userId);
    if (!user) throw new UnauthorizedException('User not found');
    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branch_id,
      must_change_password: user.must_change_password,
    };
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branch_id,
      must_change_password: user.must_change_password,
    };

    const access_token = this.jwt.sign(payload);

    const rawRefreshToken = crypto.randomUUID();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresInDays = this.config.get<number>('app.refreshExpiresInDays') ?? 7;
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    await this.repo.saveRefreshToken(user.id, tokenHash, expiresAt);

    return { access_token, refresh_token: rawRefreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
