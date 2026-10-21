import { useRef, useState } from 'react';
import { Field, FormError, inputClass } from '@foodcourt/finance-ui';
import { newRequestKey, shopAdmin } from '@foodcourt/firebase-client/shop-admin';
import type { MenuCategory } from '@foodcourt/shared';
import { Button, Sheet, run } from '@foodcourt/ui';

export interface SectionTarget {
  seq: number;
  category: MenuCategory | null;
}

/** Add a section (Rolls, Drinks…), or rename or remove one. A section with dishes cannot be removed. */
export function SectionSheet({ open, onClose, target }: { open: boolean; onClose: () => void; target: SectionTarget }) {
  return (
    <Sheet open={open} onClose={onClose} title={target.category ? 'Edit section' : 'Add a section'} description={target.category?.name}>
      <SectionForm key={target.seq} category={target.category} onDone={onClose} />
    </Sheet>
  );
}

function SectionForm({ category, onDone }: { category: MenuCategory | null; onDone: () => void }) {
  const requestKey = useRef(newRequestKey());
  const [name, setName] = useState(category?.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (name.trim().length < 2) return setError('Give the section a name.');
    setError('');
    setSaving(true);
    const ok = await run(shopAdmin({ action: 'SAVE_CATEGORY', requestKey: requestKey.current, categoryId: category?.id, name }));
    setSaving(false);
    if (ok) onDone();
  };

  const remove = async () => {
    if (!category) return;
    setSaving(true);
    const ok = await run(shopAdmin({ action: 'DELETE_CATEGORY', categoryId: category.id }));
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
      <Field label="Section name">{(id) => <input id={id} className={inputClass} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Rolls" autoComplete="off" autoFocus />}</Field>
      <FormError text={error} />
      <Button type="submit" variant="accent" size="lg" block loading={saving}>
        {category ? 'Save' : 'Add section'}
      </Button>
      {category &&
        (category.items.length ? (
          <p className="text-center text-sm text-ink-3">To remove this section, first move or remove its {category.items.length} {category.items.length === 1 ? 'dish' : 'dishes'}.</p>
        ) : (
          <Button variant="danger" block onClick={() => void remove()} disabled={saving}>
            Remove this section
          </Button>
        ))}
    </form>
  );
}
