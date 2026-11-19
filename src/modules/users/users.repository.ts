import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';

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
}
