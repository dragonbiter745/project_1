import { useMemo, useState } from 'react';
import { Bell, Map as MapIcon, Search, ShoppingBag, SlidersHorizontal, Table2, X } from 'lucide-react';
import { cx } from '@foodcourt/ui';
import { AREAS, TABLES } from '../../data/layout';
import { SHOPS } from '../../data/shops';
import { setAmbient } from '../../lib/audio';
import { useCart } from '../../store/cart';
import { useUi, type CameraMode, type DayMode, type Quality, type Weather } from '../../store/ui';
import type { Crowd, Speed } from '../../sim/types';
import { formatClock } from '../format';
import { Popover, Segmented } from './Popover';

const iconBtn =
  'pressable glass grid h-11 w-11 place-items-center rounded-full text-ink-2 transition-colors hover:bg-white/90 hover:text-ink aria-expanded:bg-white aria-expanded:text-ink';

export function TopBar() {
  const snap = useUi((s) => s.snapshot);
  const count = useCart((s) => s.lines.reduce((n, l) => n + l.qty, 0));
  const exit = () => useUi.getState().set({ explore: false, cameraMode: 'orbit', orderOpen: false, dataOpen: false, follow: null, selection: null });

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3 md:p-4">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2">
        <div className="glass flex h-11 items-center gap-2.5 rounded-full pl-1.5 pr-4">
          <img src="/qrave-wordmark.png" alt="Qrave" width="420" height="149" className="ml-2.5 h-7 w-auto select-none" draggable={false} />
          <span title="A simulated lunch service; diners, orders and timings are illustrative." className="hidden items-center gap-1.5 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-ink md:inline-flex">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-accent" />
            Demo
          </span>
        </div>
        <div className="hidden lg:block">
          <SearchBox />
        </div>
        <div className="hidden md:block">
          <AreaMenu />
        </div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <ClockSpeed clock={snap ? formatClock(snap.clockMinutes) : ''} />
        <ControlsMenu />
        <AlertsMenu />
        <button
          type="button"
          onClick={() => useUi.getState().set({ orderOpen: !useUi.getState().orderOpen })}
          className="pressable relative inline-flex h-11 items-center gap-2 rounded-full bg-ink pl-4 pr-4 text-sm font-semibold text-white shadow-float transition-colors hover:bg-ink/90"
        >
          <ShoppingBag className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">Order</span>
          {count > 0 && (
            <span key={count} className="tick grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] tabular-nums">
              {count}
            </span>
          )}
        </button>
        <button type="button" aria-label="Leave the 3D court" onClick={exit} className={iconBtn}>
          <X className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

function ClockSpeed({ clock }: { clock: string }) {
  const speed = useUi((s) => s.speed);
  return (
    <div className="glass hidden h-11 items-center gap-1 rounded-full pl-4 pr-1 sm:flex">
      <span className="mr-2 font-mono text-sm font-semibold tabular-nums text-ink">{clock}</span>
      {([1, 4, 12] as Speed[]).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={speed === v}
          onClick={() => useUi.getState().set({ speed: v })}
          className={cx(
            'h-9 rounded-full px-2.5 text-[13px] font-semibold tabular-nums transition-colors',
            speed === v ? 'bg-ink text-white' : 'text-ink-3 hover:bg-white/80 hover:text-ink'
          )}
        >
          {v}×
        </button>
      ))}
    </div>
  );
}

function AreaMenu() {
  return (
    <Popover
      label="Jump to an area"
      align="left"
      width="w-[230px]"
      triggerClass="pressable glass inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink-2 hover:text-ink"
      trigger={() => (
        <>
          <MapIcon className="h-4 w-4" strokeWidth={2} /> Areas
        </>
      )}
    >
      {(close) => (
        <ul className="space-y-0.5">
          {AREAS.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  const s = useUi.getState();
                  s.set({ follow: null, selection: null, cameraMode: 'orbit' });
                  s.flyTo(a.position, a.target);
                  close();
                }}
                className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-sm font-medium text-ink-2 transition-colors hover:bg-white hover:text-ink"
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function ControlsMenu() {
  const s = useUi();
  const youId = s.snapshot?.you?.agentId ?? null;
  return (
    <Popover
      label="Court controls"
      width="w-[min(92vw,340px)]"
      triggerClass={iconBtn}
      trigger={() => <SlidersHorizontal className="h-5 w-5" strokeWidth={2} />}
    >
      {() => (
        <div className="space-y-4 p-1">
          <div className="lg:hidden">
            <SearchBox />
          </div>
          <div className="md:hidden">
            <Field label="Jump to">
              <div className="flex flex-wrap gap-1.5">
                {AREAS.map((a) => (
                  <button key={a.id} type="button" className="chip bg-white/70" onClick={() => s.flyTo(a.position, a.target)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="sm:hidden">
            <Field label="Time speed">
              <Segmented label="Time speed" value={s.speed} onChange={(v) => s.set({ speed: v })} options={[1, 4, 12].map((v) => ({ value: v as Speed, label: `${v}×` }))} />
            </Field>
          </div>
          <Field label="Camera">
            <Segmented<CameraMode>
              label="Camera"
              value={s.follow !== null && s.follow === youId ? 'follow' : s.cameraMode}
              onChange={(v) => {
                if (v === 'follow' && youId !== null) s.set({ cameraMode: 'follow', follow: youId });
                else s.set({ cameraMode: v, follow: null });
              }}
              options={[
                { value: 'orbit', label: 'Orbit' },
                { value: 'follow', label: 'Follow you', disabled: youId === null },
                { value: 'cinematic', label: 'Cinematic' },
              ]}
            />
          </Field>
          <Field label="Crowd">
            <Segmented<Crowd>
              label="Crowd"
              value={s.crowd}
              onChange={(v) => s.set({ crowd: v })}
              options={[
                { value: 'quiet', label: 'Quiet' },
                { value: 'normal', label: 'Normal' },
                { value: 'rush', label: 'Lunch rush' },
              ]}
            />
          </Field>
          <Field label="Weather">
            <Segmented<Weather>
              label="Weather"
              value={s.weather}
              onChange={(v) => s.set({ weather: v })}
              options={[
                { value: 'clear', label: 'Clear' },
                { value: 'rain', label: 'Rain' },
                { value: 'heatwave', label: 'Heat' },
                { value: 'festival', label: 'Festival' },
              ]}
            />
          </Field>
          <Field label="Light">
            <Segmented<DayMode>
              label="Light"
              value={s.dayMode}
              onChange={(v) => s.set({ dayMode: v })}
              options={[
                { value: 'auto', label: 'Clock' },
                { value: 'day', label: 'Day' },
                { value: 'night', label: 'Night' },
              ]}
            />
          </Field>
          <Field label="Quality">
            <Segmented<Quality | 'auto'>
              label="Quality"
              value={s.autoQuality ? 'auto' : s.quality}
              onChange={(v) => (v === 'auto' ? s.set({ autoQuality: true }) : s.set({ autoQuality: false, quality: v }))}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Toggle label="Table heatmap" on={s.heatmap} onClick={() => s.set({ heatmap: !s.heatmap })} />
            <Toggle
              label="Sound"
              on={s.sound}
              onClick={() => {
                setAmbient(!s.sound);
                s.set({ sound: !s.sound });
              }}
            />
          </div>
          <Toggle label="Live data tables" on={s.dataOpen} onClick={() => s.set({ dataOpen: !s.dataOpen })} wide />
        </div>
      )}
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-1 text-xs font-semibold text-ink-3">{label}</p>
      {children}
    </div>
  );
}

function Toggle({ label, on, onClick, wide }: { label: string; on: boolean; onClick: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'pressable flex h-11 items-center justify-between rounded-[14px] px-3.5 text-sm font-semibold transition-colors',
        on ? 'bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line' : 'bg-white/70 text-ink-2 hover:bg-white',
        wide && 'w-full'
      )}
    >
      {label}
      <span className={cx('relative h-5 w-9 rounded-full transition-colors', on ? 'bg-accent-ink' : 'bg-line-strong')}>
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-thumb transition-transform duration-200', on ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </span>
    </button>
  );
}

function AlertsMenu() {
  const alerts = useUi((s) => s.snapshot?.alerts ?? []);
  return (
    <Popover
      label="Court alerts"
      width="w-[300px]"
      triggerClass={cx(iconBtn, 'relative')}
      trigger={() => (
        <>
          <Bell className="h-5 w-5" strokeWidth={2} />
          {alerts.length > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-white" />}
        </>
      )}
    >
      {(close) =>
        alerts.length === 0 ? (
          <p className="px-2 py-3 text-sm text-ink-3">All calm. Nothing needs attention.</p>
        ) : (
          <ul className="space-y-1">
            {alerts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    useUi.getState().select(a.target);
                    close();
                  }}
                  className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-sm text-ink-2 transition-colors hover:bg-white"
                >
                  <span className={cx('h-2 w-2 shrink-0 rounded-full', a.tone === 'danger' ? 'bg-danger' : a.tone === 'warn' ? 'bg-prep' : 'bg-accent')} />
                  {a.text}
                </button>
              </li>
            ))}
          </ul>
        )
      }
    </Popover>
  );
}

type Result = { key: string; label: string; hint: string; run: () => void };

function SearchBox() {
  const [q, setQ] = useState('');
  const snap = useUi((s) => s.snapshot);
  const results = useMemo<Result[]>(() => {
    const query = q.trim().toLowerCase();
    if (query.length < 1) return [];
    const ui = useUi.getState();
    const out: Result[] = [];
    for (const shop of SHOPS) {
      if (shop.name.toLowerCase().includes(query) || shop.code.toLowerCase() === query) out.push({ key: shop.id, label: shop.name, hint: 'Shop', run: () => ui.select({ kind: 'shop', id: shop.id }) });
      for (const m of shop.menu) {
        if (m.name.toLowerCase().includes(query))
          out.push({ key: m.id, label: m.name, hint: shop.name, run: () => (ui.select({ kind: 'shop', id: shop.id }), ui.set({ orderOpen: true, orderShop: shop.id })) });
      }
    }
    for (const t of TABLES) if (t.label.toLowerCase() === query || t.label.toLowerCase().replace('t0', 't') === query) out.push({ key: t.id, label: `Table ${t.label}`, hint: 'Table', run: () => ui.select({ kind: 'table', id: t.id }) });
    for (const st of snap?.shops ?? []) {
      for (const tok of [...st.ready, ...st.preparing]) if (tok.toLowerCase().includes(query)) out.push({ key: tok, label: tok, hint: `${st.name} token`, run: () => ui.select({ kind: 'shop', id: st.id }) });
    }
    return out.slice(0, 8);
  }, [q, snap]);

  return (
    <div className="relative">
      <label className="glass flex h-11 w-full items-center gap-2 rounded-full px-4 lg:w-[260px]">
        <Search className="h-4 w-4 shrink-0 text-ink-3" strokeWidth={2} />
        <span className="sr-only">Search the court</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              results[0].run();
              setQ('');
            }
          }}
          placeholder="Shop, dish, table or token"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
        />
      </label>
      {results.length > 0 && (
        <ul className="glass-strong absolute left-0 top-[calc(100%+8px)] z-30 w-full min-w-[260px] rounded-[18px] p-1.5">
          {results.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                onClick={() => {
                  r.run();
                  setQ('');
                }}
                className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-white"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  {r.hint === 'Table' && <Table2 className="h-3.5 w-3.5 text-ink-3" />}
                  {r.label}
                </span>
                <span className="truncate text-xs text-ink-3">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
