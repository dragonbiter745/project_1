import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, ImageIcon, Pencil, Plus } from 'lucide-react';
import { shopAdmin } from '@foodcourt/firebase-client/shop-admin';
import { formatPaise, type MenuCategory } from '@foodcourt/shared';
import { Button, Skeleton, VegDot, cx, run } from '@foodcourt/ui';
import { useLocal } from '../lib/store';
import { ItemSheet, type ItemTarget } from './ItemSheet';
import { SectionSheet, type SectionTarget } from './SectionSheet';

/**
 * The shop's menu as a diner sees it: sections, then dishes with photo, name and price. Tap a dish
 * to change it; "Order" switches a section to reorder mode with up and down buttons.
 */
export function Menu({ vendorId }: { vendorId: string }) {
  const menu = useLocal((s) => s.menus[vendorId] ?? null);
  const soldOut = useLocal((s) => s.availability[vendorId]?.unavailable ?? {});
  const [item, setItem] = useState<{ open: boolean; target: ItemTarget }>({ open: false, target: { seq: 0, item: null, categoryId: '' } });
  const [section, setSection] = useState<{ open: boolean; target: SectionTarget }>({ open: false, target: { seq: 0, category: null } });
  // The section whose dishes are being put in order, or 'sections' for the sections themselves.
  const [ordering, setOrdering] = useState<string | null>(null);

  if (!menu) return <Skeleton className="h-72 w-full rounded-sheet" />;
  const categories = [...menu.categories].sort((a, b) => a.sort - b.sort);

  const openSection = (category: MenuCategory | null) => setSection((s) => ({ open: true, target: { seq: s.target.seq + 1, category } }));
  const addDish = (categoryId = categories[0]?.id) => {
    if (!categoryId) return openSection(null);
    setItem((s) => ({ open: true, target: { seq: s.target.seq + 1, item: null, categoryId } }));
  };

  const move = (ids: string[], index: number, by: -1 | 1, categoryId?: string) => {
    const next = [...ids];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to]!, next[index]!];
    void run(shopAdmin({ action: 'REORDER', categoryId, ids: next }));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px] font-bold leading-tight text-ink">Menu</h1>
          <p className="text-sm text-ink-3">What diners see. Changes show up right away.</p>
        </div>
        <Button variant="accent" onClick={() => addDish()} icon={<Plus className="h-5 w-5" />}>
          Add dish
        </Button>
      </div>

      {categories.length === 0 && (
        <div className="rounded-sheet bg-surface p-6 text-center shadow-card ring-1 ring-inset ring-line/70">
          <p className="text-base font-semibold text-ink">Your menu is empty</p>
          <p className="mt-1 text-sm text-ink-3">Start with a section like “Rolls” or “Drinks”, then add dishes to it.</p>
          <Button variant="accent" className="mt-4" onClick={() => openSection(null)} icon={<Plus className="h-5 w-5" />}>
            Add a section
          </Button>
        </div>
      )}

      {categories.map((category, ci) => {
        const items = [...category.items].sort((a, b) => a.sort - b.sort);
        const sectionOrdering = ordering === 'sections';
        const itemOrdering = ordering === category.id;
        return (
          <section key={category.id} aria-labelledby={`sec-${category.id}`} className="overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
            <header className="flex items-center gap-2 px-4 py-3">
              {sectionOrdering && (
                <ReorderButtons
                  label={category.name}
                  first={ci === 0}
                  last={ci === categories.length - 1}
                  onUp={() => move(categories.map((c) => c.id), ci, -1)}
                  onDown={() => move(categories.map((c) => c.id), ci, 1)}
                />
              )}
              <h2 id={`sec-${category.id}`} className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-ink">
                {category.name} <span className="text-sm font-medium text-ink-3">· {items.length}</span>
              </h2>
              {!sectionOrdering && (
                <>
                  {items.length > 1 && (
                    <Button size="sm" variant={itemOrdering ? 'accent' : 'quiet'} onClick={() => setOrdering(itemOrdering ? null : category.id)}>
                      {itemOrdering ? 'Done' : 'Order'}
                    </Button>
                  )}
                  <button type="button" onClick={() => openSection(category)} aria-label={`Edit section ${category.name}`} className="pressable grid h-9 w-9 place-items-center rounded-full text-ink-3 hover:bg-surface-2">
                    <Pencil className="h-4 w-4" />
                  </button>
                </>
              )}
            </header>

            <ul className="divide-y divide-line/60 border-t border-line/60">
              {items.map((dish, di) => (
                <li key={dish.id} className="flex items-center gap-3 px-4 py-3">
                  {itemOrdering && (
                    <ReorderButtons label={dish.name} first={di === 0} last={di === items.length - 1} onUp={() => move(items.map((i) => i.id), di, -1, category.id)} onDown={() => move(items.map((i) => i.id), di, 1, category.id)} />
                  )}
                  <button
                    type="button"
                    disabled={itemOrdering}
                    onClick={() => setItem((s) => ({ open: true, target: { seq: s.target.seq + 1, item: dish, categoryId: category.id } }))}
                    className="pressable flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-card bg-surface-2 text-ink-3">
                      {dish.imageUrl ? <img src={dish.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6" strokeWidth={1.6} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <VegDot veg={dish.veg} size="sm" className="mt-1 shrink-0" />
                        <span className={cx('line-clamp-2 text-base font-semibold leading-snug text-ink', soldOut[dish.id] && 'text-ink-3')}>{dish.name}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-sm">
                        <span className="font-semibold tabular-nums text-ink-2">{formatPaise(dish.pricePaise)}</span>
                        {soldOut[dish.id] && <span className="rounded-full bg-danger-tint px-2 py-0.5 text-xs font-semibold text-danger">Sold out</span>}
                        {!dish.imageUrl && !soldOut[dish.id] && <span className="text-xs text-ink-3">No photo</span>}
                      </span>
                    </span>
                    {!itemOrdering && <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />}
                  </button>
                </li>
              ))}
              {items.length === 0 && <li className="px-4 py-4 text-sm text-ink-3">No dishes yet.</li>}
            </ul>
            <button type="button" onClick={() => addDish(category.id)} className="pressable flex h-12 w-full items-center justify-center gap-2 border-t border-line/60 text-sm font-semibold text-accent-ink hover:bg-accent-tint/50">
              <Plus className="h-4 w-4" /> Add dish to {category.name}
            </button>
          </section>
        );
      })}

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openSection(null)} icon={<Plus className="h-5 w-5" />}>
            Add section
          </Button>
          {categories.length > 1 && (
            <Button variant={ordering === 'sections' ? 'accent' : 'outline'} onClick={() => setOrdering(ordering === 'sections' ? null : 'sections')}>
              {ordering === 'sections' ? 'Done ordering' : 'Order sections'}
            </Button>
          )}
        </div>
      )}

      <ItemSheet open={item.open} onClose={() => setItem((s) => ({ ...s, open: false }))} target={item.target} categories={categories} vendorId={vendorId} />
      <SectionSheet open={section.open} onClose={() => setSection((s) => ({ ...s, open: false }))} target={section.target} />
    </div>
  );
}

function ReorderButtons({ label, first, last, onUp, onDown }: { label: string; first: boolean; last: boolean; onUp: () => void; onDown: () => void }) {
  const base = 'pressable grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-ink disabled:opacity-30';
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" className={base} disabled={first} onClick={onUp} aria-label={`Move ${label} up`}>
        <ArrowUp className="h-5 w-5" />
      </button>
      <button type="button" className={base} disabled={last} onClick={onDown} aria-label={`Move ${label} down`}>
        <ArrowDown className="h-5 w-5" />
      </button>
    </span>
  );
}
