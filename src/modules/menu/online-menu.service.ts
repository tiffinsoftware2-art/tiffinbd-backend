import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AddonsService } from '../addons/addons.service';
import { Branch } from '../branches/entities/branch.entity';
import { OrderSource } from '../normalization/dto/unified-order.dto';
import { SettingsService } from '../settings/settings.service';
import { MenuService } from './menu.service';
import {
  toBranch,
  toCompanyVat,
  toFoodCategory,
  toFoodItem,
} from './online-menu.mapper';

const COMPANY_ID = 'tiffin';

@Injectable()
export class OnlineMenuService {
  constructor(
    private readonly menuService: MenuService,
    private readonly settings: SettingsService,
    private readonly addons: AddonsService,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
  ) {}

  /** Builds the payload the website's TiffinDataModel expects. */
  async getTiffinData(imageBaseUrl?: string) {
    const [categories, items, branches, config, addons] = await Promise.all([
      this.menuService.findAllCategories(),
      this.menuService.findAllItems(),
      this.branchRepo.find({
        where: { is_active: true },
        order: { name: 'ASC' },
      }),
      this.settings.getManualOrderConfig(),
      this.addons.findAll(),
    ]);

    return {
      company: {
        _id: COMPANY_ID,
        name: 'Tiffin',
        slug: COMPANY_ID,
        // VAT is managed on the dashboard Settings page. Service charge and
        // delivery charge are not stored in the backend, so they stay off
        // (Delivery Charge currently exists as an ordinary menu item).
        vat: toCompanyVat(
          Number(config.vatPercent),
          this.settings.vatExcludedFor(config, OrderSource.WEBSITE),
        ),
        sc: { percentage: 0, applicable: false },
        deliveryCharge: { type: 'FLAT', amount: 0, applicable: false },
        logo: '',
        invoiceCurrency: 'BDT',
        isOnlineOrderOTP: false,
      },
      branches: branches.map((b) => toBranch(b, COMPANY_ID)),
      foodItems: items.map((i) => toFoodItem(i, imageBaseUrl)),
      foodCategories: categories.map(toFoodCategory),
      // Extras customers can tick on a food page (managed on the dashboard's
      // Add-ons page). Active ones only; `_id` is what the website sends back
      // as the order line's itemId. A new key — the website ignores unknown
      // keys, so older website builds are unaffected.
      addOns: addons
        .filter((a) => a.is_active)
        .map((a) => ({ _id: a.id, name: a.name, price: Number(a.price) })),
      tables: [],
    };
  }
}
