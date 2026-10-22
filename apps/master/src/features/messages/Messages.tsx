import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BellRing, CalendarClock, ChefHat, Inbox, Mail, Megaphone, Plus, Send, Store, Users, UtensilsCrossed, X } from 'lucide-react';
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX, audienceLabel, maskPhone, type Campaign, type CampaignAudience, type Coupon, type CustomerRecord } from '@foodcourt/shared';
import { Button, cx, showActionError } from '@foodcourt/ui';
import { findCustomers } from '@foodcourt/firebase-client/customers';
import { listCoupons } from '@foodcourt/firebase-client/coupons';
import { cancelCampaign, estimateAudience, listCampaigns, sendCampaign } from '@foodcourt/firebase-client/messages';
import { Drawer } from '../../components/Drawer';
import { KpiTile } from '../../components/KpiTile';
import { jsonEqual, useLocal } from '../../lib/store';

const dateTime = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const cleanName = (name: string) => name.replace(/^[^\p{L}\p{N}]+/u, '').trim();
const DAY = 86_400_000;

/** Another page (a customer's drawer) can open the composer addressed to one diner. */
export const MESSAGE_TO_KEY = 'fc_message_to';

const STATUS: Record<Campaign['status'], { label: string; className: string }> = {
  SENT: { label: 'Sent', className: 'bg-ready-tint text-ready' },
  SCHEDULED: { label: 'Scheduled', className: 'bg-prep-tint text-prep' },
  SENDING: { label: 'Sending', className: 'bg-accent-tint text-accent-ink' },
  CANCELLED: { label: 'Cancelled', className: 'bg-surface-2 text-ink-3' },
  FAILED: { label: 'Failed', className: 'bg-danger-tint text-danger' },
};

type Names = { shops: Array<{ id: string; name: string }>; categories: Record<string, Array<{ id: string; name: string }>> };

function useNames(): Names {
  return useLocal(
    (s) => ({
      shops: s.vendors.map((v) => ({ id: v.id, name: v.name })),
      categories: Object.fromEntries(s.vendors.map((v) => [v.id, (s.menus[v.id]?.categories ?? []).map((c) => ({ id: c.id, name: cleanName(c.name) }))])),
    }),
    jsonEqual
  );
}

export function Messages() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState<{ to?: { uid: string; name: string } } | null>(null);
  const names = useNames();
  const label = (a: CampaignAudience) =>
    audienceLabel(a, {
      shop: (id) => names.shops.find((s) => s.id === id)?.name ?? id,
      category: (v, c) => names.categories[v]?.find((x) => x.id === c)?.name ?? c,
    });

  const load = useCallback(() => {
    setError(null);
    listCampaigns()
      .then(setCampaigns)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MESSAGE_TO_KEY);
      if (raw) {
        sessionStorage.removeItem(MESSAGE_TO_KEY);
        setComposing({ to: JSON.parse(raw) as { uid: string; name: string } });
      }
    } catch {
      // ignore
    }
  }, []);

  const cancel = async (c: Campaign) => {
    if (!window.confirm(`Cancel "${c.title}"? It will not be sent.`)) return;
    try {
      await cancelCampaign(c.id);
    } catch (err) {
      // Usually the message went out moments ago; the reload below shows it as sent.
      showActionError((err as Error).message);
    }
    load();
  };

  const recent = campaigns?.filter((c) => c.status === 'SENT' && (c.sentAt ?? 0) > Date.now() - 30 * DAY) ?? [];
  const reached = recent.reduce((n, c) => n + (c.stats?.recipients ?? 0), 0);
  const pushed = recent.reduce((n, c) => n + (c.stats?.pushSent ?? 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[64ch] text-sm text-ink-2">
          Messages go to signed-in diners' inboxes. Those who agreed to offers also get a phone alert. Kitchen announcements show on the kitchen displays.
        </p>
        <Button variant="accent" icon={<Plus className="h-4 w-4" />} onClick={() => setComposing({})}>
          New message
        </Button>
      </div>

      <dl className="mt-5 grid gap-4 md:grid-cols-3">
        <KpiTile feature label="Sent in 30 days" value={campaigns ? String(recent.length) : '…'} icon={Send} tone="accent" />
        <KpiTile label="Diners and kitchens reached" value={campaigns ? reached.toLocaleString('en-IN') : '…'} icon={Users} tone="ready" />
        <KpiTile label="Phone alerts delivered" value={campaigns ? pushed.toLocaleString('en-IN') : '…'} icon={BellRing} tone="prep" />
      </dl>

      {error && (
        <p role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger">
          {error}
          <Button size="sm" variant="outline" onClick={load}>
            Try again
          </Button>
        </p>
      )}

      <section aria-labelledby="history" className="mt-6 overflow-hidden rounded-sheet bg-surface shadow-card ring-1 ring-inset ring-line/70">
        <h2 id="history" className="px-6 pt-5 text-lg font-semibold tracking-tight text-ink">
          History
        </h2>
        {campaigns === null && !error ? (
          <div className="m-6 h-32 shimmer rounded-card" />
        ) : campaigns && campaigns.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
              <Megaphone className="h-6 w-6" />
            </span>
            <p className="mt-4 text-base font-semibold text-ink">No messages yet</p>
            <p className="mx-auto mt-1 max-w-[44ch] text-sm text-ink-3">Tell regulars about a new dish, win back lapsed diners with a coupon, or brief every kitchen at once.</p>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {campaigns?.map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-4 px-6 py-4">
                <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-full', c.audience.kind === 'KITCHENS' ? 'bg-prep-tint text-prep' : 'bg-accent-tint text-accent-ink')}>
                  {c.audience.kind === 'KITCHENS' ? <ChefHat className="h-[18px] w-[18px]" /> : <Megaphone className="h-[18px] w-[18px]" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-ink">{c.title}</p>
                    <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold', STATUS[c.status].className)}>{STATUS[c.status].label}</span>
                    {c.couponCode && <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 font-mono text-xs font-semibold text-ink-2">{c.couponCode}</span>}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{c.body}</p>
                  <p className="mt-1 text-xs text-ink-3">
                    {label(c.audience)} · {c.status === 'SCHEDULED' ? `Goes out ${dateTime.format(c.sendAt)}` : dateTime.format(c.sentAt ?? c.createdAt)} · {c.createdBy}
                  </p>
                  {c.error && <p className="mt-1 text-xs text-danger">{c.error}</p>}
                </div>
                {c.stats && (
                  <dl className="flex shrink-0 gap-5 text-right text-sm">
                    <div>
                      <dt className="text-xs text-ink-3">{c.audience.kind === 'KITCHENS' ? 'Kitchens' : 'Inbox'}</dt>
                      <dd className="font-semibold tabular-nums text-ink">{c.audience.kind === 'KITCHENS' ? c.stats.recipients : c.stats.inbox}</dd>
                    </div>
                    {c.audience.kind !== 'KITCHENS' && (
                      <div>
                        <dt className="text-xs text-ink-3">Phone alerts</dt>
                        <dd className="font-semibold tabular-nums text-ink">
                          {c.stats.pushSent}
                          <span className="font-normal text-ink-3">/{c.stats.pushTargets}</span>
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {c.status === 'SCHEDULED' && (
                  <Button size="sm" variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => void cancel(c)}>
                    Cancel
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Composer
        open={composing !== null}
        to={composing?.to}
        names={names}
        onClose={() => setComposing(null)}
        onSent={() => {
          setComposing(null);
          load();
        }}
      />
    </>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

type Target = 'MEMBERS' | 'REGULARS' | 'NEW' | 'LAPSED' | 'SHOP' | 'CATEGORY' | 'PEOPLE' | 'KITCHENS';

const DINER_TARGETS: Array<{ key: Target; label: string; hint: string }> = [
  { key: 'MEMBERS', label: 'Everyone signed in', hint: 'All diners with an account' },
  { key: 'REGULARS', label: 'Regulars', hint: '3+ visits, seen in 30 days' },
  { key: 'NEW', label: 'New this week', hint: 'First visit in 7 days' },
  { key: 'LAPSED', label: 'Lapsed', hint: 'Not back in 30+ days' },
  { key: 'SHOP', label: 'Ordered from a shop', hint: 'Pick the shop' },
  { key: 'CATEGORY', label: 'Ordered a category', hint: 'Pick shop and category' },
  { key: 'PEOPLE', label: 'Chosen diners', hint: 'Find by mobile or email' },
];

const inputClass =
  'h-11 w-full rounded-field bg-surface px-3.5 text-sm text-ink ring-1 ring-inset ring-line-strong outline-none transition-shadow placeholder:text-ink-3 focus:ring-2 focus:ring-accent/60';

const toLocalInput = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`);

function Composer({ open, to, names, onClose, onSent }: { open: boolean; to?: { uid: string; name: string }; names: Names; onClose: () => void; onSent: () => void }) {
  const [target, setTarget] = useState<Target>('MEMBERS');
  const [vendorId, setVendorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kitchens, setKitchens] = useState<string[]>(['ALL']);
  const [people, setPeople] = useState<Array<{ uid: string; name: string }>>([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<CustomerRecord[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [sendAt, setSendAt] = useState(() => toLocalInput(Date.now() + 3_600_000));
  const [estimate, setEstimate] = useState<{ recipients: number; pushTargets: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per opened composer: a double tap on Send lands once.
  const requestKey = useRef('');

  useEffect(() => {
    if (!open) return;
    requestKey.current = newKey();
    setTarget(to ? 'PEOPLE' : 'MEMBERS');
    setPeople(to ? [to] : []);
    setVendorId(names.shops[0]?.id ?? '');
    setCategoryId('');
    setKitchens(['ALL']);
    setTitle('');
    setBody('');
    setCouponCode('');
    setWhen('now');
    setSendAt(toLocalInput(Date.now() + 3_600_000));
    setConfirming(false);
    setError(null);
    setFound(null);
    setSearch('');
    listCoupons()
      .then((list) => setCoupons(list.filter((c) => c.active && (c.endsAt === null || c.endsAt > Date.now()))))
      .catch(() => setCoupons([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, to]);

  const audience = useMemo<CampaignAudience | null>(() => {
    switch (target) {
      case 'SHOP':
        return vendorId ? { kind: 'SHOP', vendorId } : null;
      case 'CATEGORY':
        return vendorId && categoryId ? { kind: 'CATEGORY', vendorId, categoryId } : null;
      case 'PEOPLE':
        return people.length > 0 ? { kind: 'PEOPLE', uids: people.map((p) => p.uid) } : null;
      case 'KITCHENS':
        return kitchens.length > 0 ? { kind: 'KITCHENS', vendorIds: kitchens } : null;
      default:
        return { kind: target };
    }
  }, [target, vendorId, categoryId, people, kitchens]);

  // A live count of who it reaches, a moment after the choice settles.
  const audienceKey = JSON.stringify(audience);
  useEffect(() => {
    setEstimate(null);
    if (!open || !audience) return;
    const t = setTimeout(() => {
      estimateAudience(audience)
        .then(setEstimate)
        .catch(() => setEstimate(null));
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, audienceKey]);

  const find = (e: FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    findCustomers(search)
      .then(setFound)
      .catch(() => setFound([]));
  };

  const kitchensMode = target === 'KITCHENS';
  const ready = Boolean(audience) && title.trim().length >= 3 && body.trim().length >= 3;

  const send = async () => {
    if (!audience) return;
    setSending(true);
    setError(null);
    try {
      const at = when === 'later' ? new Date(sendAt).getTime() : undefined;
      await sendCampaign({
        requestKey: requestKey.current,
        title: title.trim(),
        body: body.trim(),
        audience,
        ...(couponCode && !kitchensMode ? { couponCode } : {}),
        ...(at ? { sendAt: at } : {}),
      });
      onSent();
    } catch (err) {
      setError((err as Error).message);
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const reachText = estimate
    ? kitchensMode
      ? `${estimate.recipients} ${estimate.recipients === 1 ? 'kitchen' : 'kitchens'}`
      : `${estimate.recipients} signed-in ${estimate.recipients === 1 ? 'diner' : 'diners'} · ${estimate.pushTargets} get a phone alert`
    : audience
      ? 'Counting…'
      : 'Finish choosing who it is for';

  return (
    <Drawer
      open={open}
      title="New message"
      description="Diners see it in their inbox; those who agreed to offers also get a phone alert."
      width={620}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={cx('text-sm', error ? 'font-medium text-danger' : 'text-ink-2')} role={error ? 'alert' : undefined}>
            {error ?? reachText}
          </p>
          {confirming ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <Button variant="accent" loading={sending} icon={<Send className="h-4 w-4" />} onClick={() => void send()}>
                {when === 'later' ? 'Schedule it' : 'Send it now'}
              </Button>
            </div>
          ) : (
            <Button variant="accent" disabled={!ready} onClick={() => setConfirming(true)}>
              {when === 'later' ? 'Review and schedule' : 'Review and send'}
            </Button>
          )}
        </div>
      }
    >
      {confirming ? (
        <div className="space-y-5">
          <p className="text-base text-ink">
            {when === 'later' ? 'Schedule' : 'Send'} <span className="font-semibold">“{title}”</span> to <span className="font-semibold">{reachText}</span>
            {when === 'later' ? ` on ${dateTime.format(new Date(sendAt).getTime())}` : ' right now'}?
          </p>
          <Preview title={title} body={body} couponCode={kitchensMode ? '' : couponCode} kitchens={kitchensMode} />
          <p className="text-sm text-ink-3">Sent messages cannot be taken back. Scheduled ones can be cancelled until they go out.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-3">
            <p className="text-sm font-medium text-ink">Who it's for</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {DINER_TARGETS.map((p) => (
                <Choice key={p.key} on={target === p.key} onClick={() => setTarget(p.key)} icon={<Users className="h-4 w-4" />} label={p.label} hint={p.hint} />
              ))}
              <Choice on={kitchensMode} onClick={() => setTarget('KITCHENS')} icon={<ChefHat className="h-4 w-4" />} label="Kitchens" hint="Shows on the kitchen displays" />
            </div>

            {(target === 'SHOP' || target === 'CATEGORY') && (
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={vendorId}
                  onChange={(e) => {
                    setVendorId(e.target.value);
                    setCategoryId('');
                  }}
                  className={inputClass}
                  aria-label="Shop"
                >
                  {names.shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {target === 'CATEGORY' && (
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass} aria-label="Category">
                    <option value="">Pick a category</option>
                    {(names.categories[vendorId] ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {target === 'PEOPLE' && (
              <div className="space-y-3">
                {people.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {people.map((p) => (
                      <span key={p.uid} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-tint pl-3 pr-1 text-sm font-medium text-accent-ink ring-1 ring-inset ring-accent-line">
                        {p.name}
                        <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPeople((list) => list.filter((x) => x.uid !== p.uid))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <form onSubmit={find} className="flex gap-2">
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Mobile number or email" className={inputClass} aria-label="Find a diner" />
                  <Button type="submit" variant="quiet" className="!h-11">
                    Find
                  </Button>
                </form>
                {found && (
                  <ul className="divide-y divide-line overflow-hidden rounded-card ring-1 ring-inset ring-line">
                    {found.length === 0 && <li className="px-4 py-3 text-sm text-ink-3">No diner with that mobile number or email.</li>}
                    {found.map((c) => {
                      const name = c.name || c.displayName || 'Guest';
                      const added = people.some((p) => p.uid === c.uid);
                      return (
                        <li key={c.uid} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">{name}</span>
                            <span className="block truncate text-xs text-ink-3">{[maskPhone(c.phone), c.email, c.member ? null : 'Guest: sees it once they sign in'].filter(Boolean).join(' · ')}</span>
                          </span>
                          <Button size="sm" variant={added ? 'ghost' : 'tint'} disabled={added} onClick={() => setPeople((list) => [...list, { uid: c.uid, name }])}>
                            {added ? 'Added' : 'Add'}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {kitchensMode && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className={cx('flex cursor-pointer items-center gap-3 rounded-card p-3 ring-1 ring-inset', kitchens.includes('ALL') ? 'bg-accent-tint ring-accent-line' : 'bg-surface ring-line/70')}>
                  <input type="checkbox" checked={kitchens.includes('ALL')} onChange={(e) => setKitchens(e.target.checked ? ['ALL'] : [])} className="h-4 w-4 accent-[rgb(var(--accent-ink))]" />
                  <span className="text-sm font-medium text-ink">Every kitchen</span>
                </label>
                {!kitchens.includes('ALL') &&
                  names.shops.map((s) => (
                    <label key={s.id} className={cx('flex cursor-pointer items-center gap-3 rounded-card p-3 ring-1 ring-inset', kitchens.includes(s.id) ? 'bg-accent-tint ring-accent-line' : 'bg-surface ring-line/70')}>
                      <input
                        type="checkbox"
                        checked={kitchens.includes(s.id)}
                        onChange={() => setKitchens((list) => (list.includes(s.id) ? list.filter((x) => x !== s.id) : [...list, s.id]))}
                        className="h-4 w-4 accent-[rgb(var(--accent-ink))]"
                      />
                      <Store className="h-4 w-4 text-ink-3" />
                      <span className="text-sm font-medium text-ink">{s.name}</span>
                    </label>
                  ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">Message</p>
              <ChannelChips kitchens={kitchensMode} />
            </div>
            <label className="block">
              <span className="sr-only">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MESSAGE_TITLE_MAX} placeholder={kitchensMode ? 'Gas check at 4pm' : 'New at Roll Me: Paneer Tikka Roll'} className={inputClass} />
              <span className="mt-1 block text-right text-xs tabular-nums text-ink-3">
                {title.length}/{MESSAGE_TITLE_MAX}
              </span>
            </label>
            <label className="block">
              <span className="sr-only">Message</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={MESSAGE_BODY_MAX}
                rows={3}
                placeholder={kitchensMode ? 'Please switch off burners at 4pm for the safety check.' : 'Try it this week. Use the coupon below for 20% off.'}
                className={cx(inputClass, 'h-auto py-2.5')}
              />
              <span className="mt-1 block text-right text-xs tabular-nums text-ink-3">
                {body.length}/{MESSAGE_BODY_MAX}
              </span>
            </label>
            {!kitchensMode && (
              <label className="block">
                <span className="block text-sm font-medium text-ink">Attach a coupon (optional)</span>
                <select value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className={cx(inputClass, 'mt-1.5')}>
                  <option value="">No coupon</option>
                  {coupons.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-ink-3">Shown with a Use coupon button in the inbox.</span>
              </label>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-sm font-medium text-ink">When</p>
            <div role="radiogroup" aria-label="When to send" className="inline-flex w-full rounded-full bg-surface-2 p-1">
              {(['now', 'later'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={when === w}
                  onClick={() => setWhen(w)}
                  className={cx('h-9 flex-1 rounded-full text-sm font-medium transition-colors', when === w ? 'bg-surface text-ink shadow-card' : 'text-ink-2 hover:text-ink')}
                >
                  {w === 'now' ? 'Send now' : 'Schedule'}
                </button>
              ))}
            </div>
            {when === 'later' && (
              <label className="flex items-center gap-3">
                <CalendarClock className="h-4 w-4 shrink-0 text-ink-3" />
                <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className={inputClass} aria-label="Send at" />
              </label>
            )}
          </section>

          <section className="space-y-2">
            <p className="text-sm font-medium text-ink">Preview</p>
            <Preview title={title} body={body} couponCode={kitchensMode ? '' : couponCode} kitchens={kitchensMode} />
          </section>
        </div>
      )}
    </Drawer>
  );
}

function Choice({ on, onClick, icon, label, hint }: { on: boolean; onClick: () => void; icon: ReactNode; label: string; hint: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx('flex items-start gap-3 rounded-card p-3 text-left ring-1 ring-inset transition-colors', on ? 'bg-accent-tint ring-accent-line' : 'bg-surface ring-line/70 hover:bg-surface-2')}
    >
      <span className={cx('mt-0.5 shrink-0', on ? 'text-accent-ink' : 'text-ink-3')}>{icon}</span>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-ink-3">{hint}</span>
      </span>
    </button>
  );
}

function ChannelChips({ kitchens }: { kitchens: boolean }) {
  const chip = 'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium';
  if (kitchens) {
    return (
      <span className={cx(chip, 'bg-prep-tint text-prep')}>
        <ChefHat className="h-3.5 w-3.5" /> Kitchen display
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={cx(chip, 'bg-ready-tint text-ready')}>
        <Inbox className="h-3.5 w-3.5" /> Inbox
      </span>
      <span className={cx(chip, 'bg-ready-tint text-ready')}>
        <BellRing className="h-3.5 w-3.5" /> Phone alert
      </span>
      <span className={cx(chip, 'bg-surface-2 text-ink-3')} title="Email comes in a later update">
        <Mail className="h-3.5 w-3.5" /> Email later
      </span>
    </span>
  );
}

/** What it looks like: a phone lock-screen notification, and the inbox card with its coupon. */
function Preview({ title, body, couponCode, kitchens }: { title: string; body: string; couponCode: string; kitchens: boolean }) {
  if (kitchens) {
    return (
      <div className="flex items-start gap-3 rounded-card bg-accent-tint px-4 py-3 ring-1 ring-inset ring-accent-line">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">{title || 'Your title'}</p>
          <p className="text-sm text-ink-2">{body || 'Your message to the kitchens.'}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-[22px] bg-[linear-gradient(160deg,#4a514c,#2b302d)] p-3" aria-label="Phone notification preview">
        <div className="rounded-[16px] bg-white/90 p-3">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded-[6px] bg-accent-ink text-on-accent">
              <UtensilsCrossed className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <span className="text-2xs font-semibold uppercase tracking-wide text-ink-3">REVA Food · now</span>
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold text-ink">{title || 'Your title'}</p>
          <p className="line-clamp-3 text-sm text-ink-2">{body || 'Your message.'}</p>
        </div>
      </div>
      <div className="rounded-card bg-surface p-4 ring-1 ring-inset ring-line" aria-label="Inbox preview">
        <p className="text-xs font-medium text-ink-3">In their inbox</p>
        <p className="mt-1 text-base font-semibold text-ink">{title || 'Your title'}</p>
        <p className="mt-0.5 text-sm text-ink-2">{body || 'Your message.'}</p>
        {couponCode && (
          <div className="mt-3 flex items-center justify-between rounded-field bg-accent-tint px-3 py-2 ring-1 ring-inset ring-accent-line">
            <span className="font-mono text-sm font-semibold text-accent-ink">{couponCode}</span>
            <span className="rounded-full bg-accent-ink px-3 py-1 text-xs font-semibold text-on-accent">Use coupon</span>
          </div>
        )}
      </div>
    </div>
  );
}
