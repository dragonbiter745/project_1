import { Crosshair, ShoppingBag, X } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { useUi } from '../../store/ui';

export function DetailPanel() {
  const selection = useUi((s) => s.selection);
  const detail = useUi((s) => s.snapshot?.detail ?? null);
  const follow = useUi((s) => s.follow);
  if (!selection || !detail) return null;
  const ui = useUi.getState();
  const following = selection.kind === 'person' && follow === selection.id;

  return (
    <aside
      key={`${selection.kind}-${selection.id}`}
      aria-label="Selected"
      className="glass-strong spotlight pointer-events-auto absolute inset-x-3 bottom-3 z-20 max-h-[46dvh] overflow-y-auto rounded-[26px] p-5 md:inset-x-auto md:bottom-auto md:right-4 md:top-[76px] md:w-[340px] md:max-h-[calc(100dvh-100px)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-3">
            {detail.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: detail.color }} />}
            {detail.kicker}
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-ink">{detail.title}</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => ui.select(null)}
          className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 transition-colors hover:bg-line"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>

      {detail.stats.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-2">
          {detail.stats.map((s) => (
            <div key={s.label} className="rounded-[14px] bg-white/70 px-3 py-2.5 ring-1 ring-inset ring-line/60">
              <dt className="text-xs text-ink-3">{s.label}</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {detail.lines.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-ink-2">
          {detail.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {selection.kind === 'person' && (
          <button
            type="button"
            aria-pressed={following}
            onClick={() => ui.set({ follow: following ? null : selection.id })}
            className={cx(
              'pressable inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
              following ? 'bg-accent-ink text-white' : 'bg-ink text-white hover:bg-black'
            )}
          >
            <Crosshair className="h-4 w-4" strokeWidth={2} />
            {following ? 'Following' : 'Follow'}
          </button>
        )}
        {selection.kind === 'shop' && (
          <button
            type="button"
            onClick={() => ui.set({ orderOpen: true, orderShop: selection.id })}
            className="pressable inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-black"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={2} />
            Order from here
          </button>
        )}
        {selection.kind === 'table' && (
          <button
            type="button"
            onClick={() => ui.set({ orderOpen: true, presetTable: selection.id })}
            className="pressable inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white hover:bg-black"
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={2} />
            Order to this table
          </button>
        )}
      </div>
    </aside>
  );
}
