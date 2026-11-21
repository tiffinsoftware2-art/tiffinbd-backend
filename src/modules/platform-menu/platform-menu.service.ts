import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuService } from '../menu/menu.service';
import {
  CreatePlatformMenuItemDto,
  UpdatePlatformMenuItemDto,
} from './dto/platform-menu-item.dto';
import { PlatformMenuItem } from './entities/platform-menu-item.entity';
import {
  PLATFORM_MENU_SOURCES,
  PlatformMenuSource,
} from './platform-menu.constants';

@Injectable()
export class PlatformMenuService {
  constructor(
    @InjectRepository(PlatformMenuItem)
    private readonly repo: Repository<PlatformMenuItem>,
    private readonly menuService: MenuService,
  ) {}

  // Without a platform, returns every platform's items (for the dashboard
  // overview); with one, only that platform's menu.
  async findAll(platform?: string): Promise<PlatformMenuItem[]> {
    if (platform !== undefined && !this.isPlatform(platform)) {
      throw new BadRequestException(
        `platform must be one of: ${PLATFORM_MENU_SOURCES.join(', ')}`,
      );
    }
    return this.repo.find({
      where: platform ? { platform } : {},
      order: { platform: 'ASC', category: 'ASC', serial: 'DESC', name: 'ASC' },
    });
  }

  async create(dto: CreatePlatformMenuItemDto): Promise<PlatformMenuItem> {
    await this.assertNameFree(dto.platform, dto.name.trim());
    return this.repo.save(
      this.repo.create({
        platform: dto.platform,
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        price: dto.price,
        is_active: dto.is_active ?? true,
        serial: dto.serial ?? null,
      }),
    );
  }

  async update(
    id: string,
    dto: UpdatePlatformMenuItemDto,
  ): Promise<PlatformMenuItem> {
    const item = await this.get(id);
    if (dto.name !== undefined && dto.name.trim() !== item.name) {
      await this.assertNameFree(item.platform, dto.name.trim(), item.id);
      item.name = dto.name.trim();
    }
    if (dto.category !== undefined)
      item.category = dto.category?.trim() || null;
    if (dto.price !== undefined) item.price = dto.price;
    if (dto.is_active !== undefined) item.is_active = dto.is_active;
    if (dto.serial !== undefined) item.serial = dto.serial ?? null;
    return this.repo.save(item);
  }

  // Orders keep their own copy of each line's name and price, so removing a
  // platform item never changes past orders.
  async remove(id: string): Promise<{ deleted: true }> {
    await this.repo.remove(await this.get(id));
    return { deleted: true };
  }

  // One-time starter: copies the website menu onto a platform, to be edited
  // afterwards. Never overwrites: an item whose name already exists on that
  // platform is skipped, so it is safe to run again. The website menu itself
  // can hold several items with the same name; a platform menu keeps one per
  // name (the first), since (platform, name) is unique.
  async copyFromWebsite(
    platform: PlatformMenuSource,
  ): Promise<{ created: number; skipped: number }> {
    const [websiteItems, existing] = await Promise.all([
      this.menuService.findAllItems(),
      this.repo.find({ where: { platform }, select: ['name'] }),
    ]);
    const taken = new Set(existing.map((e) => e.name));

    const fresh: PlatformMenuItem[] = [];
    for (const i of websiteItems) {
      const name = i.name.trim();
      if (taken.has(name)) continue;
      taken.add(name);
      fresh.push(
        this.repo.create({
          platform,
          name,
          category: i.category?.name ?? null,
          price: Number(i.price),
          is_active: true,
          serial: i.serial ?? null,
        }),
      );
    }
    if (fresh.length > 0) await this.repo.save(fresh);
    return {
      created: fresh.length,
      skipped: websiteItems.length - fresh.length,
    };
  }

  private isPlatform(value: string): value is PlatformMenuSource {
    return (PLATFORM_MENU_SOURCES as readonly string[]).includes(value);
  }

  private async get(id: string): Promise<PlatformMenuItem> {
    const item = await this.repo.findOneBy({ id });
    if (!item)
      throw new NotFoundException(`Platform menu item ${id} not found`);
    return item;
  }

  private async assertNameFree(
    platform: PlatformMenuSource,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.repo.findOneBy({ platform, name });
    if (clash && clash.id !== exceptId) {
      throw new ConflictException(
        `"${name}" already exists on the ${platform} menu`,
      );
    }
  }
}
