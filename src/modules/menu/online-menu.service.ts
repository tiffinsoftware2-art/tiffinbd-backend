import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { MenuService } from './menu.service';
import { toBranch, toFoodCategory, toFoodItem } from './online-menu.mapper';

const COMPANY_ID = 'tiffin';

@Injectable()
export class OnlineMenuService {
  constructor(
    private readonly menuService: MenuService,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
  ) {}

  /** Builds the payload the website's TiffinDataModel expects. */
  async getTiffinData() {
    const [categories, items, branches] = await Promise.all([
      this.menuService.findAllCategories(),
      this.menuService.findAllItems(),
      this.branchRepo.find({ where: { is_active: true }, order: { name: 'ASC' } }),
    ]);

    return {
      company: {
        _id: COMPANY_ID,
        name: 'Tiffin',
        slug: COMPANY_ID,
        // TODO: confirm real values. VAT / service charge / delivery charge are
        // not stored in the backend, so they are switched off here. (Delivery
        // Charge currently exists as an ordinary menu item.)
        vat: { percentage: 0, applicable: false },
        sc: { percentage: 0, applicable: false },
        deliveryCharge: { type: 'FLAT', amount: 0, applicable: false },
        logo: '',
        invoiceCurrency: 'BDT',
        isOnlineOrderOTP: false,
      },
      branches: branches.map((b) => toBranch(b, COMPANY_ID)),
      foodItems: items.map(toFoodItem),
      foodCategories: categories.map(toFoodCategory),
      tables: [],
    };
  }
}
