import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';

@Injectable()
export class MenuRepository {
  constructor(
    @InjectRepository(MenuCategory)
    private readonly categoryRepo: Repository<MenuCategory>,
    @InjectRepository(MenuItem)
    private readonly itemRepo: Repository<MenuItem>,
  ) {}

  findAllCategories(): Promise<MenuCategory[]> {
    return this.categoryRepo.find({ order: { score: 'ASC' } });
  }

  findAllItems(): Promise<MenuItem[]> {
    return this.itemRepo.find({ relations: ['category'], order: { serial: 'DESC' } });
  }

  findCategoryById(id: string): Promise<MenuCategory | null> {
    return this.categoryRepo.findOneBy({ id });
  }

  findItemById(id: string): Promise<MenuItem | null> {
    return this.itemRepo.findOne({ where: { id }, relations: ['category'] });
  }

  countItemsInCategory(categoryId: string): Promise<number> {
    return this.itemRepo.count({ where: { category: { id: categoryId } } });
  }

  saveCategory(category: MenuCategory): Promise<MenuCategory> {
    return this.categoryRepo.save(category);
  }

  saveItem(item: MenuItem): Promise<MenuItem> {
    return this.itemRepo.save(item);
  }

  async removeCategory(category: MenuCategory): Promise<void> {
    await this.categoryRepo.remove(category);
  }

  async removeItem(item: MenuItem): Promise<void> {
    await this.itemRepo.remove(item);
  }

  createCategory(data: Partial<MenuCategory>): MenuCategory {
    return this.categoryRepo.create(data);
  }

  createItem(data: Partial<MenuItem>): MenuItem {
    return this.itemRepo.create(data);
  }
}
