import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { LoginAudit } from '../auth/entities/login-audit.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User, UserRole } from '../auth/entities/user.entity';
import { BranchesRepository } from './branches.repository';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { Branch } from './entities/branch.entity';

export interface UserActivityEntry {
  id: string;
  name: string | null;
  username: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  isOnline: boolean;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  recentLogins: {
    result: 'SUCCESS' | 'FAILURE';
    ip_address: string;
    attempted_at: Date;
    failure_reason: string | null;
  }[];
}

export interface BranchActivity {
  branch: Pick<Branch, 'id' | 'name'>;
  users: UserActivityEntry[];
}

@Injectable()
export class BranchesService {
  constructor(
    private readonly repo: BranchesRepository,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(LoginAudit)
    private readonly loginAuditRepo: Repository<LoginAudit>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  findAll(): Promise<Array<Branch & { device_count: number; has_active_device: boolean }>> {
    return this.repo.findAllWithDeviceCount();
  }

  async findById(id: string): Promise<Branch> {
    const branch = await this.repo.findById(id);
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return branch;
  }

  async validateExists(id: string): Promise<void> {
    const branch = await this.repo.findById(id);
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
  }

  async create(dto: CreateBranchDto): Promise<Branch> {
    const branch = this.repo.create({
      name: dto.name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      is_active: dto.is_active ?? true,
    });
    return this.repo.save(branch);
  }

  async update(id: string, dto: UpdateBranchDto): Promise<Branch> {
    const branch = await this.findById(id);
    if (dto.name !== undefined) branch.name = dto.name;
    if (dto.address !== undefined) branch.address = dto.address ?? null;
    if (dto.phone !== undefined) branch.phone = dto.phone ?? null;
    if (dto.is_active !== undefined) branch.is_active = dto.is_active;
    return this.repo.save(branch);
  }

  // A branch that users, devices, orders or platform outlets still point at
  // cannot be deleted without orphaning them — deactivate it instead
  // (PATCH is_active=false).
  async remove(id: string): Promise<{ deleted: true }> {
    const branch = await this.findById(id);
    const refs = await this.repo.countReferences(id);
    const inUse = Object.entries(refs).filter(([, n]) => n > 0);
    if (inUse.length > 0) {
      const detail = inUse.map(([label, n]) => `${n} ${label}`).join(', ');
      throw new ConflictException(
        `Branch "${branch.name}" is in use (${detail}). Deactivate it instead of deleting.`,
      );
    }
    await this.repo.remove(branch);
    return { deleted: true };
  }

  async getBranchActivity(branchId: string): Promise<BranchActivity> {
    const branch = await this.findById(branchId);

    const users = await this.userRepo.find({
      where: { branch_id: branchId },
      select: ['id', 'name', 'username', 'role', 'is_active', 'must_change_password'],
      order: { username: 'ASC' },
    });

    const now = new Date();

    const userActivity = await Promise.all(
      users.map(async (user): Promise<UserActivityEntry> => {
        const activeToken = await this.refreshTokenRepo.findOne({
          where: { user_id: user.id, is_revoked: false, expires_at: MoreThan(now) },
        });

        const lastLogin = await this.loginAuditRepo.findOne({
          where: { user_id: user.id, result: 'SUCCESS' },
          order: { attempted_at: 'DESC' },
        });

        const recentLogins = await this.loginAuditRepo.find({
          where: { user_id: user.id },
          order: { attempted_at: 'DESC' },
          take: 10,
        });

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          is_active: user.is_active,
          must_change_password: user.must_change_password,
          isOnline: !!activeToken,
          lastLoginAt: lastLogin?.attempted_at ?? null,
          lastLoginIp: lastLogin?.ip_address ?? null,
          recentLogins: recentLogins.map((l) => ({
            result: l.result,
            ip_address: l.ip_address,
            attempted_at: l.attempted_at,
            failure_reason: l.failure_reason,
          })),
        };
      }),
    );

    return { branch: { id: branch.id, name: branch.name }, users: userActivity };
  }

}
