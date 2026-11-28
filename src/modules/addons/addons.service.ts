import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAddonDto, UpdateAddonDto } from './dto/addon.dto';
import { Addon } from './entities/addon.entity';

@Injectable()
export class AddonsService {
  constructor(@InjectRepository(Addon) private readonly repo: Repository<Addon>) {}

  findAll(): Promise<Addon[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async getOrFail(id: string): Promise<Addon> {
    const addon = await this.repo.findOneBy({ id });
    if (!addon) throw new NotFoundException(`Add-on ${id} not found`);
    return addon;
  }

  create(dto: CreateAddonDto): Promise<Addon> {
    return this.repo.save(
      this.repo.create({ name: dto.name.trim(), price: dto.price, is_active: dto.is_active ?? true }),
    );
  }

  async update(id: string, dto: UpdateAddonDto): Promise<Addon> {
    const addon = await this.getOrFail(id);
    if (dto.name !== undefined) addon.name = dto.name.trim();
    if (dto.price !== undefined) addon.price = dto.price;
    if (dto.is_active !== undefined) addon.is_active = dto.is_active;
    return this.repo.save(addon);
  }

  // Safe to hard-delete: orders keep their own copy of the name and price.
  async remove(id: string): Promise<{ deleted: true }> {
    const addon = await this.getOrFail(id);
    await this.repo.remove(addon);
    return { deleted: true };
  }
}
