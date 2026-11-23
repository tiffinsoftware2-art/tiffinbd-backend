import { PLATFORM_MENU_SOURCES } from '../platform-menu/platform-menu.constants';

const PLATFORM_LABEL: Record<string, string> = {
  FOODPANDA: 'Foodpanda',
  PATHAO: 'Pathao',
  FOODIE: 'Foodi',
  PHYSICAL_STORE: 'Physical Store',
  TIFFIN_TAKEAWAY: 'Tiffin Takeaway',
  STAFF: 'Staff',
};

// Delivery platforms (Foodpanda, Pathao, Foodi) hold the customer's details
// themselves, so staff do not have to type them in for those sources.
export function isCustomerOptional(source: unknown): boolean {
  return (PLATFORM_MENU_SOURCES as readonly string[]).includes(String(source));
}

// Blank details are stored as empty strings (never null), and a blank name
// becomes "<Platform> customer" so the order is still readable in lists.
export function resolveManualCustomer(dto: {
  source: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  notes?: string;
}): { name: string; phone: string; address: string; notes?: string } {
  const name = (dto.customerName ?? '').trim();
  return {
    name: name || (isCustomerOptional(dto.source) ? `${PLATFORM_LABEL[dto.source]} customer` : ''),
    phone: (dto.customerPhone ?? '').trim(),
    address: (dto.customerAddress ?? '').trim(),
    notes: dto.notes,
  };
}
