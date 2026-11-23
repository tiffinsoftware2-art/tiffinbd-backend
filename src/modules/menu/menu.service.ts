import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateMenuCategoryDto, UpdateMenuCategoryDto } from './dto/menu-category.dto';
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/menu-item.dto';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';
import { MenuItemImage } from './entities/menu-item-image.entity';
import { detectImageMime, MAX_MENU_IMAGE_BYTES } from './menu-image.util';
import { MenuRepository } from './menu.repository';

// external_id is the id the website sends with an order line. Items created
// here get a fresh 24-char hex id (same shape as the existing ones); it never
// changes after creation, so existing orders keep resolving.
const newExternalId = () => randomBytes(12).toString('hex');

@Injectable()
export class MenuService {
  constructor(
    private readonly repo: MenuRepository,
    @InjectRepository(MenuItemImage)
    private readonly imageRepo: Repository<MenuItemImage>,
  ) {}

  findAllCategories(): Promise<MenuCategory[]> {
    return this.repo.findAllCategories();
  }

  // Each item also carries `uploaded_image_version` when a photo was uploaded
  // for it (looked up without loading the image bytes).
  async findAllItems(): Promise<MenuItem[]> {
    const [items, images] = await Promise.all([
      this.repo.findAllItems(),
      this.imageRepo.find({ select: { menu_item_id: true, updated_at: true } }),
    ]);
    const versionById = new Map(images.map((i) => [i.menu_item_id, i.updated_at.getTime()]));
    for (const item of items) item.uploaded_image_version = versionById.get(item.id) ?? null;
    return items;
  }

  // ── Categories ────────────────────────────────────────────────────────────

  createCategory(dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    return this.repo.saveCategory(
      this.repo.createCategory({
        external_id: newExternalId(),
        name: dto.name,
        score: dto.score ?? 0,
      }),
    );
  }

  async updateCategory(id: string, dto: UpdateMenuCategoryDto): Promise<MenuCategory> {
    const category = await this.getCategory(id);
    if (dto.name !== undefined) category.name = dto.name;
    if (dto.score !== undefined) category.score = dto.score;
    return this.repo.saveCategory(category);
  }

  async deleteCategory(id: string): Promise<{ deleted: true }> {
    const category = await this.getCategory(id);
    const inUse = await this.repo.countItemsInCategory(id);
    if (inUse > 0) {
      throw new ConflictException(
        `Category "${category.name}" still has ${inUse} item(s). Move or delete them first.`,
      );
    }
    await this.repo.removeCategory(category);
    return { deleted: true };
  }

  // ── Items ─────────────────────────────────────────────────────────────────

  async createItem(dto: CreateMenuItemDto): Promise<MenuItem> {
    const category = dto.categoryId ? await this.getCategory(dto.categoryId) : null;
    const item = this.repo.createItem({
      external_id: newExternalId(),
      name: dto.name,
      price: dto.price,
      description: dto.description ?? null,
      images: dto.images ?? null,
      is_popular: dto.is_popular ?? false,
      vat_inclusive: dto.vat_inclusive ?? false,
      sc_inclusive: dto.sc_inclusive ?? false,
      is_never_kot: dto.is_never_kot ?? false,
      is_no_discount: dto.is_no_discount ?? false,
      serial: dto.serial ?? null,
      category,
    });
    return this.repo.saveItem(item);
  }

  async updateItem(id: string, dto: UpdateMenuItemDto): Promise<MenuItem> {
    const item = await this.getItem(id);
    if (dto.name !== undefined) item.name = dto.name;
    if (dto.price !== undefined) item.price = dto.price;
    if (dto.description !== undefined) item.description = dto.description ?? null;
    if (dto.images !== undefined) item.images = dto.images ?? null;
    if (dto.is_popular !== undefined) item.is_popular = dto.is_popular;
    if (dto.vat_inclusive !== undefined) item.vat_inclusive = dto.vat_inclusive;
    if (dto.sc_inclusive !== undefined) item.sc_inclusive = dto.sc_inclusive;
    if (dto.is_never_kot !== undefined) item.is_never_kot = dto.is_never_kot;
    if (dto.is_no_discount !== undefined) item.is_no_discount = dto.is_no_discount;
    if (dto.serial !== undefined) item.serial = dto.serial ?? null;
    if (dto.categoryId !== undefined) {
      item.category = dto.categoryId ? await this.getCategory(dto.categoryId) : null;
    }
    return this.repo.saveItem(item);
  }

  async deleteItem(id: string): Promise<{ deleted: true }> {
    const item = await this.getItem(id);
    await this.imageRepo.delete({ menu_item_id: item.id });
    await this.repo.removeItem(item);
    return { deleted: true };
  }

  // ── Uploaded photo (replaces the item's image links on the website) ───────

  getImage(itemId: string): Promise<MenuItemImage | null> {
    return this.imageRepo.findOneBy({ menu_item_id: itemId });
  }

  async setImage(itemId: string, file: { buffer: Buffer; size: number } | undefined) {
    const item = await this.getItem(itemId);
    if (!file || !file.buffer?.length) throw new BadRequestException('No image file was sent');
    if (file.size > MAX_MENU_IMAGE_BYTES) {
      throw new BadRequestException('Image is too large (max 2 MB)');
    }
    const mime = detectImageMime(file.buffer);
    if (!mime) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');
    await this.imageRepo.save(
      this.imageRepo.create({ menu_item_id: item.id, data: file.buffer, mime_type: mime }),
    );
    const saved = await this.imageRepo.findOneByOrFail({ menu_item_id: item.id });
    return { uploaded_image_version: saved.updated_at.getTime() };
  }

  async removeImage(itemId: string): Promise<{ deleted: true }> {
    await this.getItem(itemId);
    await this.imageRepo.delete({ menu_item_id: itemId });
    return { deleted: true };
  }

  private async getCategory(id: string): Promise<MenuCategory> {
    const category = await this.repo.findCategoryById(id);
    if (!category) throw new NotFoundException(`Menu category ${id} not found`);
    return category;
  }

  private async getItem(id: string): Promise<MenuItem> {
    const item = await this.repo.findItemById(id);
    if (!item) throw new NotFoundException(`Menu item ${id} not found`);
    return item;
  }
}
