import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { User } from '../auth/entities/user.entity';
import { OrderCompletion } from '../orders/entities/order-completion.entity';
import { OrderDeleteRequest } from '../orders/entities/order-delete-request.entity';
import { Order } from '../orders/entities/order.entity';

const SAFE_FIELDS: (keyof User)[] = [
  'id', 'name', 'username', 'role', 'branch_id',
  'must_change_password', 'is_active', 'created_at', 'updated_at',
];

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findAllPaginated(page: number, limit: number): Promise<[User[], number]> {
    return this.repo.findAndCount({
      select: SAFE_FIELDS,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id }, select: SAFE_FIELDS });
  }

  findByIdForWrite(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async saveNew(data: Partial<User>): Promise<User> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async saveExisting(user: User): Promise<User> {
    return this.repo.save(user);
  }

  // True if this user appears as the actor on any order, completion, delete
  // request or audit-log row. Those tables keep only the user's id (no foreign
  // key), so deleting the user would silently orphan the "who did this" trail.
  async hasActivity(id: string): Promise<boolean> {
    const m = this.repo.manager;
    const found = await Promise.all([
      m.exists(Order, {
        where: [{ createdBy: id }, { acceptedBy: id }, { settledBy: id }, { archivedBy: id }],
      }),
      m.exists(OrderCompletion, { where: { completedBy: id } }),
      m.exists(OrderDeleteRequest, { where: [{ requestedBy: id }, { reviewedBy: id }] }),
      m.exists(AuditLog, { where: { actor_user_id: id } }),
    ]);
    return found.some(Boolean);
  }

  async remove(user: User): Promise<void> {
    await this.repo.remove(user);
  }
}
