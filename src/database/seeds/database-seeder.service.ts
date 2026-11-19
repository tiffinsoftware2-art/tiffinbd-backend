import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserRole } from '../../modules/auth/entities/user.entity';

@Injectable()
export class DatabaseSeederService {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async run(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;

    const existing = await this.users.findOne({ where: { username: 'superadmin' } });
    if (existing) return;

    const passwordHash = await bcrypt.hash('Tiffin@2026', 12);

    await this.users.save({
      username: 'superadmin',
      password_hash: passwordHash,
      role: UserRole.SUPER_ADMIN,
      branch_id: null,
      must_change_password: false,
      is_active: true,
    });

    this.logger.log('Super admin seeded — username: superadmin');
  }
}
