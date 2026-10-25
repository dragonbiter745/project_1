import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarRange, Copy, IndianRupee, Pause, Pencil, Play, Plus, Store, TicketPercent, Users } from 'lucide-react';
import { CouponInputSchema, couponHeadline, formatPaise, rupeesToPaise, type Coupon, type CouponInput, type CouponScope } from '@foodcourt/shared';
import { Button, cx, showActionError } from '@foodcourt/ui';
import { listCoupons, saveCoupon, setCouponActive } from '@foodcourt/firebase-client/coupons';
import { Drawer } from '../../components/Drawer';
import { KpiTile } from '../../components/KpiTile';
import { jsonEqual, useLocal } from '../../lib/store';

type Tone = 'ready' | 'prep' | 'muted';
const TONES: Record<Tone, string> = { ready: 'bg-ready-tint text-ready', prep: 'bg-prep-tint text-prep', muted: 'bg-surface-2 text-ink-3' };

function statusOf(c: Coupon, now = Date.now()): { label: string; tone: Tone } {
  if (!c.active) return { label: 'Paused', tone: 'muted' };
  if (c.endsAt && now > c.endsAt) return { label: 'Ended', tone: 'muted' };
  if (c.startsAt > now) return { label: 'Scheduled', tone: 'prep' };
  if (c.totalLimit !== null && c.usedCount >= c.totalLimit) return { label: 'Used up', tone: 'muted' };
  return { label: 'Live', tone: 'ready' };
}

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const cleanName = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim();

type Catalog = { shops: Array<{ id: string; name: string }>; categories: Record<string, Array<{ id: string; name: string; items: number }>> };

function useCatalogNames(): Catalog {
  return useLocal(
    (s) => ({
      shops: s.vendors.map((v) => ({ id: v.id, name: v.name })),
      categories: Object.fromEntries(s.vendors.map((v) => [v.id, (s.menus[v.id]?.categories ?? []).map((c) => ({ id: c.id, name: cleanName(c.name), items: c.items.length }))])),
    }),
    jsonEqual
  );
}

function scopeText(scope: CouponScope, catalog: Catalog): string {
  if (scope.kind === 'ALL') return 'Whole court';
  const shopName = (id: string) => catalog.shops.find((s) => s.id === id)?.name ?? id;
  if (scope.kind === 'VENDORS') return scope.vendorIds.map(shopName).join(', ');
  const names = scope.categories.map((c) => `${catalog.categories[c.vendorId]?.find((x) => x.id === c.categoryId)?.name ?? c.categoryId} (${shopName(c.vendorId)})`);
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more` : names.join(', ');
}

export function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const catalog = useCatalogNames();

  const load = useCallback(() => {
    setError(null);
    listCoupons()
      .then(setCoupons)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const toggle = async (c: Coupon) => {
    // Coupons are paid by the court, so switching one on or off is confirmed first.
    const ask = c.active ? `Pause ${c.code}? Diners can no longer use it.` : `Turn on ${c.code}? Diners can use it straight away.`;
    if (!window.confirm(ask)) return;
    try {
      await setCouponActive(c.code, !c.active);
      load();
    } catch (err) {
      showActionError((err as Error).message);
    }
  };

  const live = coupons?.filter((c) => statusOf(c).label === 'Live').length ?? 0;
  const uses = coupons?.reduce((n, c) => n + c.usedCount, 0) ?? 0;
  const given = coupons?.reduce((n, c) => n + c.discountGivenPaise, 0) ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-sm text-ink-2">
          The court pays every discount: shops are paid their full price and their commission is unchanged. Coupons work with online payment only.
        </p>
        <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
          New coupon
        </Button>
      </div>

      <dl className="mt-5 grid gap-4 md:grid-cols-3">
        <KpiTile feature label="Live coupons" value={coupons ? String(live) : '…'} icon={TicketPercent} tone="accent" hint={coupons ? `${coupons.length} in total` : undefined} />
        <KpiTile label="Times used" value={coupons ? uses.toLocaleString('en-IN') : '…'} icon={Users} tone="ready" />
        <KpiTile label="Discounts paid by the court" value={coupons ? formatPaise(given) : '…'} icon={IndianRupee} tone="prep" hint="Comes off court income in Finance" />
      </dl>

      {error && (
        <p role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
          {error}
          <Button size="sm" variant="outline" onClick={load}>
            Try again
          </Button>
        </p>
      )}

      {coupons === null && !error ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="shimmer h-44 rounded-sheet" />
          <div className="shimmer h-44 rounded-sheet" />
        </div>
      ) : coupons && coupons.length === 0 ? (
        <section className="mt-6 rounded-sheet bg-surface px-6 py-16 text-center shadow-card ring-1 ring-inset ring-line/70">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
            <TicketPercent className="h-6 w-6" />
          </span>
          <p className="mt-4 text-lg font-semibold text-ink">No coupons yet</p>
          <p className="mx-auto mt-1 max-w-[46ch] text-sm text-ink-3">
            Make one for the whole court, for chosen shops, or for chosen menu categories. Signed-in diners see wallet coupons in their account.
          </p>
          <Button variant="accent" className="mt-5" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            Create the first coupon
          </Button>
        </section>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {coupons?.map((c) => (
            <li key={c.code}>
              <CouponCard coupon={c} scope={scopeText(c.scope, catalog)} onEdit={() => setEditing(c)} onToggle={() => void toggle(c)} />
            </li>
          ))}
        </ul>
      )}

      <CouponEditor
        editing={editing}
        catalog={catalog}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </>
  );
}

function CouponCard({ coupon: c, scope, onEdit, onToggle }: { coupon: Coupon; scope: string; onEdit: () => void; onToggle: () => void }) {
  const status = statusOf(c);
  const usedShare = c.totalLimit ? Math.min(1, c.usedCount / c.totalLimit) : null;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
      <div className="flex items-start gap-4 p-5">
        {/* A ticket stub: the notches are surface-coloured circles over the edges. */}
        <div className="relative grid shrink-0 place-items-center rounded-card bg-accent-tint px-4 py-3 ring-1 ring-inset ring-accent-line">
          <span className="font-mono text-base font-semibold tracking-wide text-accent-ink">{c.code}</span>
          <span aria-hidden className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-surface" />
          <span aria-hidden className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-surface" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="truncate text-base font-semibold text-ink">{c.title}</p>
            <span className={cx('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold', TONES[status.tone])}>{status.label}</span>
          </div>
          <p className="text-sm font-medium text-accent-ink">{couponHeadline(c)}</p>
          <p className="mt-1 text-sm text-ink-3">
            {c.minOrderPaise > 0 ? `On ${formatPaise(c.minOrderPaise)}+ of ` : 'On '}
            <span className="text-ink-2">{scope}</span>
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 border-t border-line px-5 py-4 text-sm">
        <div>
          <dt className="text-xs text-ink-3">Used</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">
            {c.usedCount}
            {c.totalLimit ? <span className="font-normal text-ink-3"> of {c.totalLimit}</span> : null}
          </dd>
          {usedShare !== null && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${usedShare * 100}%` }} />
            </div>
          )}
        </div>
        <div>
          <dt className="text-xs text-ink-3">Discount given</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatPaise(c.discountGivenPaise)}</dd>
        </div>
        <div className="col-span-2 flex flex-wrap gap-1.5">
          <Chip>{c.audience === 'MEMBERS' ? 'Signed-in diners' : 'Everyone'}</Chip>
          {c.firstOrderOnly && <Chip>First order only</Chip>}
          <Chip>{c.perCustomerLimit === 1 ? 'Once per diner' : `${c.perCustomerLimit}× per diner`}</Chip>
          <Chip>{c.showInWallet ? 'In wallets' : 'Code only'}</Chip>
        </div>
        <p className="col-span-2 flex items-center gap-1.5 text-xs text-ink-3">
          <CalendarRange className="h-3.5 w-3.5" />
          {c.startsAt > 0 ? dateFormat.format(c.startsAt) : 'Now'} → {c.endsAt ? dateFormat.format(c.endsAt) : 'no end date'}
        </p>
      </dl>
      <div className="mt-auto flex items-center gap-1 border-t border-line px-3 py-2">
        <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
          Edit
        </Button>
        <Button size="sm" variant="ghost" icon={c.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} onClick={onToggle}>
          {c.active ? 'Pause' : 'Resume'}
        </Button>
        <Button size="sm" variant="ghost" icon={<Copy className="h-4 w-4" />} onClick={() => void navigator.clipboard?.writeText(c.code)} className="ml-auto">
          Copy code
        </Button>
      </div>
    </article>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 text-xs font-medium text-ink-2">{children}</span>;
}

// ─── Editor ──────────────────────────────────────────────────────────────────

interface Form {
  code: string;
  title: string;
  description: string;
  kind: 'PERCENT' | 'FLAT';
  percent: string;
  flat: string;
  cap: string;
  min: string;
  scope: 'ALL' | 'VENDORS' | 'CATEGORIES';
  vendorIds: string[];
  /** `${vendorId}:${categoryId}` */
  categories: string[];
  audience: 'EVERYONE' | 'MEMBERS';
  firstOrderOnly: boolean;
  showInWallet: boolean;
  startsAt: string;
  endsAt: string;
  totalLimit: string;
  perCustomerLimit: string;
}

// datetime-local inputs work in the browser's time zone, which is IST for the court manager.
const toLocalInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : NaN);
const rupees = (paise: number | null | undefined) => (paise ? String(paise / 100) : '');

function suggestCode(): string {
  const words = ['QRAVE', 'TASTY', 'HUNGRY', 'LUNCH', 'CHAI', 'FEAST', 'TREAT'];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(10 + Math.random() * 90)}`;
}

function formFrom(c: Coupon | null): Form {
  return {
    code: c?.code ?? suggestCode(),
    title: c?.title ?? '',
    description: c?.description ?? '',
    kind: c?.kind ?? 'PERCENT',
    percent: c?.percentBps ? String(c.percentBps / 100) : '10',
    flat: rupees(c?.flatPaise) || '30',
    cap: rupees(c?.maxDiscountPaise),
    min: rupees(c?.minOrderPaise),
    scope: c?.scope.kind ?? 'ALL',
    vendorIds: c?.scope.kind === 'VENDORS' ? c.scope.vendorIds : [],
    categories: c?.scope.kind === 'CATEGORIES' ? c.scope.categories.map((x) => `${x.vendorId}:${x.categoryId}`) : [],
    audience: c?.audience ?? 'EVERYONE',
    firstOrderOnly: c?.firstOrderOnly ?? false,
    showInWallet: c?.showInWallet ?? true,
    startsAt: toLocalInput(c?.startsAt || Date.now()),
    endsAt: c?.endsAt ? toLocalInput(c.endsAt) : '',
    totalLimit: c?.totalLimit ? String(c.totalLimit) : '',
    perCustomerLimit: String(c?.perCustomerLimit ?? 1),
  };
}

function toInput(f: Form): CouponInput | string {
  const blank = (v: string) => v.trim() === '';
  const scope: CouponScope =
    f.scope === 'ALL'
      ? { kind: 'ALL' }
      : f.scope === 'VENDORS'
        ? { kind: 'VENDORS', vendorIds: f.vendorIds }
        : { kind: 'CATEGORIES', categories: f.categories.map((k) => ({ vendorId: k.slice(0, k.indexOf(':')), categoryId: k.slice(k.indexOf(':') + 1) })) };
  const startsAt = fromLocalInput(f.startsAt);
  const endsAt = f.endsAt ? fromLocalInput(f.endsAt) : null;
  if (Number.isNaN(startsAt) || (endsAt !== null && Number.isNaN(endsAt))) return 'Pick valid dates.';
  const parsed = CouponInputSchema.safeParse({
    code: f.code,
    title: f.title,
    ...(f.description.trim() ? { description: f.description } : {}),
    kind: f.kind,
    ...(f.kind === 'PERCENT'
      ? { percentBps: Math.round(Number(f.percent) * 100), maxDiscountPaise: blank(f.cap) ? null : rupeesToPaise(Number(f.cap)) }
      : { flatPaise: rupeesToPaise(Number(f.flat)) }),
    minOrderPaise: blank(f.min) ? 0 : rupeesToPaise(Number(f.min)),
    scope,
    audience: f.audience,
    firstOrderOnly: f.firstOrderOnly,
    showInWallet: f.showInWallet,
    startsAt,
    endsAt,
    totalLimit: blank(f.totalLimit) ? null : Number(f.totalLimit),
    perCustomerLimit: Number(f.perCustomerLimit) || 1,
  });
  return parsed.success ? parsed.data : (parsed.error.issues[0]?.message ?? 'Check the details.');
}

const inputClass =
  'h-11 w-full rounded-field bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-line-strong outline-none transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-accent/60 disabled:bg-surface-2 disabled:text-ink-3';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-ink">{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-card bg-surface p-3.5 ring-1 ring-inset ring-line/70">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent-ink))]" />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

function Segment<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ key: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex w-full rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={cx('h-9 flex-1 rounded-full px-3 text-sm font-medium transition-colors', value === o.key ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CouponEditor({ editing, catalog, onClose, onSaved }: { editing: Coupon | 'new' | null; catalog: Catalog; onClose: () => void; onSaved: () => void }) {
  const existing = editing && editing !== 'new' ? editing : null;
  const [form, setForm] = useState<Form>(() => formFrom(existing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm(formFrom(editing === 'new' ? null : editing));
      setError(null);
    }
  }, [editing]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const flip = (key: 'vendorIds' | 'categories', id: string) => setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const preview = useMemo(() => {
    const input = toInput(form);
    return typeof input === 'string' ? null : input;
  }, [form]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input = toInput(form);
    if (typeof input === 'string') return setError(input);
    setSaving(true);
    setError(null);
    try {
      await saveCoupon(input, !existing);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={editing !== null}
      title={existing ? `Edit ${existing.code}` : 'New coupon'}
      description="The court pays the discount. Shops always get their full price."
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          {error ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          ) : (
            <span className="text-xs text-ink-3">{existing ? `Used ${existing.usedCount} times so far` : 'Starts working as soon as it is saved'}</span>
          )}
          <Button type="submit" form="coupon-form" variant="accent" loading={saving}>
            {existing ? 'Save changes' : 'Create coupon'}
          </Button>
        </div>
      }
    >
      <form id="coupon-form" onSubmit={(e) => void submit(e)} noValidate className="space-y-6">
        {preview && (
          <div className="flex items-center gap-4 rounded-card bg-accent-tint p-4 ring-1 ring-inset ring-accent-line">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-accent-ink ring-1 ring-inset ring-accent-line">
              <TicketPercent className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-accent-ink">What diners see</p>
              <p className="truncate text-base font-semibold text-ink">
                {couponHeadline(preview)} · {preview.title || 'Untitled'}
              </p>
              <p className="truncate text-xs text-ink-2">
                Code {preview.code} · {scopeText(preview.scope, catalog)}
                {preview.minOrderPaise > 0 ? ` · on ${formatPaise(preview.minOrderPaise)}+` : ''}
              </p>
            </div>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" hint={existing ? 'Codes cannot change once created.' : 'Letters, numbers and dashes.'}>
            <span className="flex gap-2">
              <input value={form.code} disabled={Boolean(existing)} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={20} className={cx(inputClass, 'font-mono uppercase tracking-wide')} />
              {!existing && (
                <Button size="sm" variant="quiet" className="!h-11" onClick={() => set('code', suggestCode())}>
                  New
                </Button>
              )}
            </span>
          </Field>
          <Field label="Title" hint="Shown to diners, like “Diwali treat”.">
            <input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={60} className={inputClass} placeholder="Lunch hour treat" />
          </Field>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-medium text-ink">Discount</p>
          <Segment label="Discount type" value={form.kind} onChange={(v) => set('kind', v)} options={[{ key: 'PERCENT', label: 'Percentage off' }, { key: 'FLAT', label: 'Flat ₹ off' }]} />
          <div className="grid gap-4 sm:grid-cols-3">
            {form.kind === 'PERCENT' ? (
              <>
                <Field label="Percent off">
                  <input inputMode="decimal" value={form.percent} onChange={(e) => set('percent', e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} />
                </Field>
                <Field label="Up to (₹)" hint="Leave empty for no cap.">
                  <input inputMode="decimal" value={form.cap} onChange={(e) => set('cap', e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} placeholder="50" />
                </Field>
              </>
            ) : (
              <Field label="Amount off (₹)">
                <input inputMode="decimal" value={form.flat} onChange={(e) => set('flat', e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} />
              </Field>
            )}
            <Field label="Minimum order (₹)" hint="Of the dishes it applies to.">
              <input inputMode="decimal" value={form.min} onChange={(e) => set('min', e.target.value.replace(/[^\d.]/g, ''))} className={inputClass} placeholder="0" />
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-sm font-medium text-ink">Works on</p>
          <Segment
            label="Coupon applies to"
            value={form.scope}
            onChange={(v) => set('scope', v)}
            options={[
              { key: 'ALL', label: 'Whole court' },
              { key: 'VENDORS', label: 'Chosen shops' },
              { key: 'CATEGORIES', label: 'Chosen categories' },
            ]}
          />
          {form.scope === 'VENDORS' && (
            <div className="grid gap-2 sm:grid-cols-2">
              {catalog.shops.map((s) => (
                <label
                  key={s.id}
                  className={cx('flex cursor-pointer items-center gap-3 rounded-card p-3 ring-1 ring-inset transition-colors', form.vendorIds.includes(s.id) ? 'bg-accent-tint ring-accent-line' : 'bg-surface ring-line/70')}
                >
                  <input type="checkbox" checked={form.vendorIds.includes(s.id)} onChange={() => flip('vendorIds', s.id)} className="h-4 w-4 accent-[rgb(var(--accent-ink))]" />
                  <Store className="h-4 w-4 text-ink-3" />
                  <span className="text-sm font-medium text-ink">{s.name}</span>
                </label>
              ))}
            </div>
          )}
          {form.scope === 'CATEGORIES' && (
            <div className="space-y-4">
              {catalog.shops.map((s) => (
                <fieldset key={s.id}>
                  <legend className="mb-2 text-xs font-semibold text-ink-3">{s.name}</legend>
                  <div className="flex flex-wrap gap-2">
                    {(catalog.categories[s.id] ?? []).map((cat) => {
                      const key = `${s.id}:${cat.id}`;
                      const on = form.categories.includes(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => flip('categories', key)}
                          className={cx(
                            'h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                            on ? 'bg-accent-tint text-accent-ink ring-accent-line' : 'bg-surface text-ink-2 ring-line hover:text-ink'
                          )}
                        >
                          {cat.name} <span className="text-ink-3">· {cat.items}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <p className="text-sm font-medium text-ink">Who can use it</p>
          <Segment label="Audience" value={form.audience} onChange={(v) => set('audience', v)} options={[{ key: 'EVERYONE', label: 'Everyone' }, { key: 'MEMBERS', label: 'Signed-in diners' }]} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle checked={form.firstOrderOnly} onChange={(v) => set('firstOrderOnly', v)} label="First order only" hint="For diners who have never ordered." />
            <Toggle checked={form.showInWallet} onChange={(v) => set('showInWallet', v)} label="Show in diners' wallets" hint="Off: it only works by typing the code." />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Uses per diner">
              <input inputMode="numeric" value={form.perCustomerLimit} onChange={(e) => set('perCustomerLimit', e.target.value.replace(/\D/g, ''))} className={inputClass} />
            </Field>
            <Field label="Total uses" hint="Leave empty for no limit.">
              <input inputMode="numeric" value={form.totalLimit} onChange={(e) => set('totalLimit', e.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="No limit" />
            </Field>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts">
            <input type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} className={inputClass} />
          </Field>
          <Field label="Ends" hint="Leave empty to run until paused.">
            <input type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} className={inputClass} />
          </Field>
        </section>

        <Field label="Note for diners (optional)">
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={200} rows={2} className={cx(inputClass, 'h-auto py-2.5')} placeholder="Valid on weekday lunches." />
        </Field>
      </form>
    </Drawer>
  );
}
