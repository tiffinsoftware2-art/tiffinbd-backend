// Sources that sell from their own menu (own items, names and prices). These
// values are OrderSource strings, so an order's `source` selects the menu. They
// are never shown on the website, which reads only the main menu.
export const PLATFORM_MENU_SOURCES = ['FOODPANDA', 'PATHAO', 'FOODIE'] as const;

export type PlatformMenuSource = (typeof PLATFORM_MENU_SOURCES)[number];
