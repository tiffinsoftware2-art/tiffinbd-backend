import { Branch } from '../branches/entities/branch.entity';
import { MenuCategory } from './entities/menu-category.entity';
import { MenuItem } from './entities/menu-item.entity';

// Pure functions: backend rows in, the website's TiffinDataModel shapes out
// (see tiffinbd-website/src/types). No database or Nest code here, so they are
// easy to test.
//
// The website's `_id` is the row's `external_id`, NOT the uuid primary key:
// the website sends these ids back with an order, and the ingest endpoint
// resolves branches and menu items through external_id.

export function toFoodCategory(c: MenuCategory) {
  return { _id: c.external_id, name: c.name, score: c.score };
}

export function toFoodItem(i: MenuItem) {
  return {
    _id: i.external_id,
    // An item with no category gets '' (the website treats it as uncategorised).
    foodCategoryId: i.category?.external_id ?? '',
    name: i.name,
    // MySQL decimals arrive as strings; the website does arithmetic on price.
    price: Number(i.price),
    selections: [], // item options are not modelled in the backend yet
    images: i.images ?? [],
    scInclusive: i.sc_inclusive,
    vatInclusive: i.vat_inclusive,
    desc: i.description?.trim() || undefined,
    isPopular: i.is_popular,
  };
}

// The website reads `company.vat` to add VAT at checkout. The rate comes from
// the dashboard Settings page (same value Manual Orders use); `excluded` is
// true when WEBSITE is in that page's "VAT excluded sources" list.
export function toCompanyVat(percent: number, excluded: boolean) {
  const percentage = Number(percent) || 0;
  return { percentage, applicable: percentage > 0 && !excluded };
}

export function toBranch(b: Branch, companyId: string) {
  return {
    // Branches without an external_id cannot be matched by the ingest
    // endpoint, so fall back to the uuid rather than dropping them.
    _id: b.external_id ?? b.id,
    name: b.name,
    companyId,
    address: b.address ?? '',
    phone: b.phone,
    onlineOrderActive: b.is_active,
  };
}
