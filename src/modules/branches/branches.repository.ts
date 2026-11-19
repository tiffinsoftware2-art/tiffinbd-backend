import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';

@Injectable()
export class BranchesRepository {
  constructor(
    @InjectRepository(Branch)
    private readonly repo: Repository<Branch>,
  ) {}

  findAll(activeOnly = false): Promise<Branch[]> {
    if (activeOnly) {
      return this.repo.find({ where: { is_active: true }, order: { name: 'ASC' } });
    }
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findAllWithDeviceCount(): Promise<Array<Branch & { device_count: number; has_active_device: boolean }>> {
    const rows = await this.repo.manager.query<
      Array<Branch & { device_count: string; has_active_device: number }>
    >(
      `SELECT b.*,
              COUNT(d.id) AS device_count,
              EXISTS(
                SELECT 1 FROM users u
                JOIN refresh_tokens rt ON rt.user_id = u.id
                WHERE u.branch_id = b.id
                  AND rt.is_revoked = 0
                  AND rt.expires_at > NOW()
              ) AS has_active_device
       FROM branches b
       LEFT JOIN devices d ON d.branch_id = b.id
       GROUP BY b.id
       ORDER BY b.name ASC`,
    );
    return rows.map((r) => ({
      ...r,
      device_count: parseInt(r.device_count, 10),
      has_active_device: Boolean(r.has_active_device),
    }));
  }

  findById(id: string): Promise<Branch | null> {
    return this.repo.findOneBy({ id });
  }

  async remove(branch: Branch): Promise<void> {
    await this.repo.remove(branch);
  }

  // Row counts of everything that references a branch. platform_outlets comes
  // from a migration that may not exist on every database, so tables are only
  // counted when present.
  async countReferences(branchId: string): Promise<Record<string, number>> {
    const targets: Array<[label: string, table: string, column: string]> = [
      ['users', 'users', 'branch_id'],
      ['devices', 'devices', 'branch_id'],
      ['orders', 'orders', 'branchId'],
      ['platform outlets', 'platform_outlets', 'branchId'],
    ];
    const out: Record<string, number> = {};
    for (const [label, table, column] of targets) {
      const exists: Array<{ n: string }> = await this.repo.manager.query(
        'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [table],
      );
      if (Number(exists[0]?.n) === 0) continue;
      const rows: Array<{ n: string }> = await this.repo.manager.query(
        `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` = ?`,
        [branchId],
      );
      out[label] = Number(rows[0]?.n ?? 0);
    }
    return out;
  }

  save(branch: Branch): Promise<Branch> {
    return this.repo.save(branch);
  }

  create(data: Partial<Branch>): Branch {
    return this.repo.create(data);
  }
}
