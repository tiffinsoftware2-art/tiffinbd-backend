import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import type { JwtPayload } from '../auth/auth.service';
import { AuthService } from '../auth/auth.service';
import { LoginAudit } from '../auth/entities/login-audit.entity';
import { User } from '../auth/entities/user.entity';
import { BranchesService } from '../branches/branches.service';
import { DevicesService } from '../devices/devices.service';
import { canManageRole } from '../../common/enums/user-role.enum';
import { AdminResetPasswordDto } from './dto/admin-reset-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';

export interface PaginatedUsers {
  data: Partial<User>[];
  meta: { page: number; limit: number; total: number };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly authService: AuthService,
    private readonly branchesService: BranchesService,
    private readonly devicesService: DevicesService,
    private readonly config: ConfigService,
  ) {}

  async findAll(page: number, limit: number): Promise<PaginatedUsers> {
    const [users, total] = await this.repo.findAllPaginated(page, limit);
    return { data: users, meta: { page, limit, total } };
  }

  async findById(id: string): Promise<Partial<User>> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto, requester: JwtPayload): Promise<Partial<User>> {
    if (!canManageRole(requester.role, dto.role)) {
      throw new ForbiddenException('Cannot create a user with a role equal to or above your own');
    }

    const existing = await this.repo.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already taken');

    if (dto.branchId != null) {
      await this.branchesService.validateExists(dto.branchId);
    }

    const saltRounds = this.config.get<number>('app.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const saved = await this.repo.saveNew({
      name: dto.name,
      username: dto.username,
      password_hash: passwordHash,
      role: dto.role,
      branch_id: dto.branchId ?? null,
      must_change_password: true,
      is_active: dto.isActive ?? true,
    });

    const { password_hash: _omit, ...safe } = saved;
    return safe;
  }

  async update(id: string, dto: UpdateUserDto, requester: JwtPayload): Promise<Partial<User>> {
    const isSelf = id === requester.sub;

    if (isSelf) {
      if (dto.role !== undefined) {
        throw new ForbiddenException('Cannot change your own role');
      }
      // Deactivating yourself revokes your own sessions and unregisters your
      // devices below — an immediate, self-inflicted lockout.
      if (dto.isActive === false) {
        throw new ForbiddenException('Cannot deactivate your own account');
      }
    }

    const user = await this.repo.findByIdForWrite(id);
    if (!user) throw new NotFoundException('User not found');

    // Seniority check against the TARGET's current role, mirroring
    // resetPassword() below. Without this, the @Roles(ADMIN) route guard was
    // the only gate: any Admin could edit a SUPER_ADMIN (or a peer Admin) and,
    // via isActive: false, revoke their sessions and unregister their devices
    // — a lockout of a senior account by a junior one. Skipped for self-edits,
    // which canManageRole always rejects (strict <, so role never manages
    // itself) and which are already constrained above.
    if (!isSelf && !canManageRole(requester.role, user.role)) {
      throw new ForbiddenException(
        'Cannot modify a user with a role equal to or above your own',
      );
    }

    if (dto.role !== undefined && !canManageRole(requester.role, dto.role)) {
      throw new ForbiddenException('Cannot assign a role equal to or above your own');
    }

    if (dto.branchId != null) {
      await this.branchesService.validateExists(dto.branchId);
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.branchId !== undefined) user.branch_id = dto.branchId ?? null;
    if (dto.isActive !== undefined) {
      const wasActive = user.is_active;
      user.is_active = dto.isActive;
      if (wasActive && !dto.isActive) {
        await this.authService.revokeAllSessions(id);
        await this.devicesService.unregister(id);
      }
    }

    const saved = await this.repo.saveExisting(user);
    const { password_hash: _omit, ...safe } = saved;
    return safe;
  }

  async resetPassword(id: string, dto: AdminResetPasswordDto, requester: JwtPayload): Promise<void> {
    const user = await this.repo.findByIdForWrite(id);
    if (!user) throw new NotFoundException('User not found');

    if (!canManageRole(requester.role, user.role)) {
      throw new ForbiddenException('Cannot reset password for a user with a role equal to or above your own');
    }

    const saltRounds = this.config.get<number>('app.bcryptRounds') ?? 12;
    user.password_hash = await bcrypt.hash(dto.newPassword, saltRounds);
    user.must_change_password = true;
    await this.repo.saveExisting(user);
    await this.authService.revokeAllSessions(id);
  }

  async getLoginActivity(userId: string, limit: number): Promise<LoginAudit[]> {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.authService.getLoginActivity(userId, limit);
  }
}
