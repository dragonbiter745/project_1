import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MENU_PRICE_MAX_PAISE, MENU_PRICE_MIN_PAISE } from '../../packages/shared/src/schemas/index';

// The menu files in docs/menus seed each shop. Every one must be safe to load as it stands: a bad price
// here is what diners get charged, so the rules the shop-admin screen enforces are checked on the files too.
const dir = join(__dirname, '../../docs/menus');
const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
const menus = files.map((f) => ({ file: f, menu: JSON.parse(readFileSync(join(dir, f), 'utf8')) as {
  vendorId: string; vendorName: string; vendorCode: string;
  categories: Array<{ id: string; name: string; sort: number; items: Array<{ id: string; name: string; pricePaise: number; veg: boolean; sort: number; desc?: string }> }>;
} }));

describe('docs/menus', () => {
  it('has a file per shop, each with its own id and code', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
    expect(new Set(menus.map((m) => m.menu.vendorId)).size).toBe(menus.length);
    expect(new Set(menus.map((m) => m.menu.vendorCode)).size).toBe(menus.length);
    for (const { menu } of menus) {
      expect(menu.vendorId).toMatch(/^vendor-[a-z0-9-]+$/);
      expect(menu.vendorCode).toMatch(/^[A-Z]{2}$/);
    }
  });

  it.each(menus)('$file: unique ids, whole-rupee prices in range, names and sizes within the limits', ({ menu }) => {
    const ids = new Set<string>();
    let dishes = 0;
    expect(menu.categories.length).toBeGreaterThan(0);
    expect(menu.categories.length).toBeLessThanOrEqual(30);
    for (const category of menu.categories) {
      expect(ids.has(category.id)).toBe(false);
      ids.add(category.id);
      expect(category.items.length).toBeGreaterThan(0);
      for (const item of category.items) {
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
        dishes += 1;
        expect(item.name.length).toBeGreaterThanOrEqual(2);
        expect(item.name.length).toBeLessThanOrEqual(60);
        expect(Number.isInteger(item.pricePaise)).toBe(true);
        expect(item.pricePaise % 100).toBe(0);
        expect(item.pricePaise).toBeGreaterThanOrEqual(MENU_PRICE_MIN_PAISE);
        expect(item.pricePaise).toBeLessThanOrEqual(MENU_PRICE_MAX_PAISE);
        expect(typeof item.veg).toBe('boolean');
        expect((item.desc ?? '').length).toBeLessThanOrEqual(200);
      }
    }
    expect(dishes).toBeLessThanOrEqual(300);
  });
});
