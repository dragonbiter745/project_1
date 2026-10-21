import { useRef, useState } from 'react';
import { Field, FormError, inputClass, parseRupees } from '@foodcourt/finance-ui';
import { newRequestKey, shopAdmin } from '@foodcourt/firebase-client/shop-admin';
import { MENU_PRICE_MAX_PAISE, MENU_PRICE_MIN_PAISE, type MenuCategory, type MenuItem } from '@foodcourt/shared';
import { Button, Sheet, cx, run } from '@foodcourt/ui';
import { PhotoField } from './PhotoField';

export interface ItemTarget {
  /** Changes every time the sheet opens, so a fresh form never shows the last dish's text. */
  seq: number;
  item: MenuItem | null;
  categoryId: string;
}

/** Add or edit one dish: photo, name, price, veg, section and a short description. */
export function ItemSheet({ open, onClose, target, categories, vendorId }: { open: boolean; onClose: () => void; target: ItemTarget; categories: MenuCategory[]; vendorId: string }) {
  return (
    <Sheet open={open} onClose={onClose} title={target.item ? 'Edit dish' : 'Add a dish'} description={target.item?.name}>
      <ItemForm key={target.seq} target={target} categories={categories} vendorId={vendorId} onDone={onClose} />
    </Sheet>
  );
}

const rupeeText = (paise: number) => String(paise / 100);

function ItemForm({ target, categories, vendorId, onDone }: { target: ItemTarget; categories: MenuCategory[]; vendorId: string; onDone: () => void }) {
  const { item } = target;
  const requestKey = useRef(newRequestKey());
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? rupeeText(item.pricePaise) : '');
  const [veg, setVeg] = useState(item?.veg ?? true);
  const [categoryId, setCategoryId] = useState(target.categoryId);
  const [desc, setDesc] = useState(item?.desc ?? '');
  const [photo, setPhoto] = useState<string | null>(item?.imageUrl ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = async () => {
    const pricePaise = parseRupees(price);
    if (name.trim().length < 2) return setError('Give the dish a name.');
    if (pricePaise === null || pricePaise < MENU_PRICE_MIN_PAISE || pricePaise > MENU_PRICE_MAX_PAISE) return setError('Enter a price between ₹1 and ₹5,000.');
    setError('');
    setSaving(true);
    const ok = await run(
      shopAdmin({ action: 'SAVE_ITEM', requestKey: requestKey.current, categoryId, itemId: item?.id, name, pricePaise, veg, desc: desc.trim() || null, imageUrl: photo })
    );
    setSaving(false);
    if (ok) onDone();
  };

  const remove = async () => {
    if (!item) return;
    setSaving(true);
    const ok = await run(shopAdmin({ action: 'DELETE_ITEM', itemId: item.id }));
    setSaving(false);
    if (ok) onDone();
  };

  return (
    <form
      className="space-y-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <PhotoField vendorId={vendorId} value={photo} onChange={setPhoto} label="Dish photo" />
      <Field label="Dish name">{(id) => <input id={id} className={inputClass} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Paneer Roll" autoComplete="off" />}</Field>
      <Field label="Price (₹)" hint="What the diner pays for one. Changes apply to new orders only.">
        {(id) => <input id={id} className={inputClass} value={price} inputMode="decimal" onChange={(e) => setPrice(e.target.value)} placeholder="120" autoComplete="off" />}
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {([true, false] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={veg === v}
              onClick={() => setVeg(v)}
              className={cx(
                'pressable flex h-12 items-center justify-center gap-2 rounded-field text-base font-semibold ring-1 ring-inset transition-colors',
                veg === v ? (v ? 'bg-ready-tint text-ready ring-ready/40' : 'bg-danger-tint text-danger ring-danger/40') : 'bg-surface text-ink-2 ring-line-strong'
              )}
            >
              <span className={cx('h-3 w-3 rounded-full', v ? 'bg-veg' : 'bg-nonveg')} /> {v ? 'Veg' : 'Non-veg'}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Section">
        {(id) => (
          <select id={id} className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Short description (optional)">
        {(id) => <textarea id={id} className={cx(inputClass, 'h-24 resize-none py-3')} value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="Grilled paneer, onions and mint chutney" />}
      </Field>

      <FormError text={error} />
      <Button type="submit" variant="accent" size="lg" block loading={saving}>
        {item ? 'Save changes' : 'Add dish'}
      </Button>
      {item &&
        (confirmRemove ? (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="quiet" onClick={() => setConfirmRemove(false)} disabled={saving}>
              Keep it
            </Button>
            <Button variant="danger" className="bg-danger-tint" onClick={() => void remove()} loading={saving}>
              Yes, remove
            </Button>
          </div>
        ) : (
          <Button variant="danger" block onClick={() => setConfirmRemove(true)} disabled={saving}>
            Remove this dish
          </Button>
        ))}
    </form>
  );
}
