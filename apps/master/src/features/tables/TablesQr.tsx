import { useEffect, useMemo, useState } from 'react';
import { Armchair, KeyRound, LayoutGrid, Printer, RefreshCw, Search, ShieldCheck, Users, UsersRound } from 'lucide-react';
import { ensureQrTokens, rotateQr } from '@foodcourt/firebase-client/ops';
import type { Table } from '@foodcourt/shared';
import { Button, cx, run } from '@foodcourt/ui';
import { KpiTile } from '../../components/KpiTile';
import { jsonEqual, useLocal } from '../../lib/store';

// QR codes are generated in the browser. Each one carries the table's unguessable token, never the
// printed table number, so nobody can order to another table by editing the link.
const CUSTOMER_URL =
  import.meta.env.VITE_CUSTOMER_APP_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://order.getqrave.in');

const qrCache = new Map<string, string>();

function useQrCode(text: string): string | null {
  const [src, setSrc] = useState<string | null>(() => qrCache.get(text) ?? null);
  useEffect(() => {
    const cached = qrCache.get(text);
    if (cached) {
      setSrc(cached);
      return;
    }
    let live = true;
    void import('qrcode')
      .then((qr) =>
        qr.toDataURL(text, { margin: 1, width: 320, errorCorrectionLevel: 'M', color: { dark: '#121214', light: '#ffffff' } })
      )
      .then((dataUrl) => {
        qrCache.set(text, dataUrl);
        if (live) setSrc(dataUrl);
      });
    return () => {
      live = false;
    };
  }, [text]);
  return src;
}

type Capacity = 'ALL' | 4 | 6;

export function TablesQr() {
  const tables = useLocal((s) => s.tables, jsonEqual);
  const [capacity, setCapacity] = useState<Capacity>('ALL');
  const [zone, setZone] = useState('ALL');
  const [query, setQuery] = useState('');

  const zones = useMemo(() => Array.from(new Set(tables.map((t) => t.zone))), [tables]);
  const seats = tables.reduce((n, t) => n + (t.capacity ?? 4), 0);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tables.filter(
      (t) =>
        (capacity === 'ALL' || (t.capacity ?? 4) === capacity) &&
        (zone === 'ALL' || t.zone === zone) &&
        (!q || t.label.toLowerCase().includes(q) || t.code.toLowerCase().includes(q))
    );
  }, [tables, capacity, zone, query]);

  const missing = tables.filter((t) => !t.qrToken).length;
  const printable = visible.filter((t) => t.qrToken).length;
  const [busy, setBusy] = useState(false);
  const generate = () => {
    setBusy(true);
    void run(ensureQrTokens()).finally(() => setBusy(false));
  };

  return (
    <>
      {missing > 0 && (
        <div data-print="hide" className="mb-6 flex flex-wrap items-center gap-4 rounded-sheet bg-accent-tint p-5 ring-1 ring-inset ring-accent-line">
          <span className="grid h-11 w-11 place-items-center rounded-[13px] bg-accent-ink text-white">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{missing} tables have no secure QR code yet</p>
            <p className="text-sm text-ink-2">Old printed codes no longer work. Generate secure codes, then print and replace the stickers.</p>
          </div>
          <Button variant="accent" loading={busy} onClick={generate}>
            Generate secure codes
          </Button>
        </div>
      )}
      <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-print="hide">
        <KpiTile feature label="Tables" value={String(tables.length)} icon={LayoutGrid} tone="accent" hint={`${zones.length} zones across the food court`} />
        <KpiTile label="Seats" value={String(seats)} icon={Users} tone="ready" />
        <KpiTile icon={Armchair} tone="prep" label="4-seat tables" value={String(tables.filter((t) => (t.capacity ?? 4) === 4).length)} />
        <KpiTile icon={UsersRound} tone="neutral" label="6-seat tables" value={String(tables.filter((t) => t.capacity === 6).length)} />
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3" data-print="hide">
        <Chips
          label="Seats"
          value={capacity}
          options={[
            { value: 'ALL', label: 'All sizes' },
            { value: 4, label: '4 seats' },
            { value: 6, label: '6 seats' },
          ]}
          onChange={setCapacity}
        />
        <Chips
          label="Zone"
          value={zone}
          options={[{ value: 'ALL', label: 'All zones' }, ...zones.map((z) => ({ value: z, label: z }))]}
          onChange={setZone}
        />
        <label className="relative w-full sm:w-56">
          <span className="sr-only">Find a table</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" strokeWidth={2} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a table"
            className="h-10 w-full rounded-full bg-surface pl-10 pr-4 text-sm text-ink outline-none ring-1 ring-inset ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-accent/50"
          />
        </label>
        <Button
          variant="ink"
          className="ml-auto"
          disabled={printable === 0}
          onClick={() => window.print()}
          icon={<Printer className="h-4 w-4" strokeWidth={2} />}
        >
          Print {printable} QR codes
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-ink-3">No tables match these filters.</p>
      ) : (
        <div data-print="grid" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {visible.map((t) => (
            <TableCard key={t.id} table={t} />
          ))}
        </div>
      )}
    </>
  );
}

function TableCard({ table }: { table: Table }) {
  const { label, zone } = table;
  const seats = table.capacity ?? 4;
  const url = table.qrToken ? `${CUSTOMER_URL}/t/${table.qrToken}` : '';
  const qr = useQrCode(url);
  const [rotating, setRotating] = useState(false);
  const replace = () => {
    if (!window.confirm(`Replace the QR code for table ${label}? The sticker on the table stops working until you print the new one.`)) return;
    setRotating(true);
    void run(rotateQr(table.id)).finally(() => setRotating(false));
  };
  return (
    <figure
      data-print={table.qrToken ? 'card' : 'hide'}
      className="group relative rounded-sheet bg-surface p-4 text-center shadow-card ring-1 ring-inset ring-line/70 transition-transform duration-200 ease-out hover:-translate-y-0.5"
    >
      <div className="mx-auto aspect-square w-full max-w-[200px] overflow-hidden rounded-card bg-surface p-2 ring-1 ring-inset ring-accent-line">
        {!table.qrToken ? (
          <span className="grid h-full w-full place-items-center rounded-[10px] bg-surface-2 text-xs font-medium text-ink-3">No secure code yet</span>
        ) : qr ? (
          <img src={qr} alt={`QR code for table ${label}`} className="h-full w-full" />
        ) : (
          <span className="shimmer block h-full w-full" />
        )}
      </div>
      <figcaption className="mt-3">
        <p className="text-xl font-semibold tracking-tight text-ink">Table {label}</p>
        <p className="mt-0.5 text-sm text-ink-3">
          {zone} · {seats} seats
        </p>
        <p className="mt-1 flex items-center justify-center gap-1 text-xs font-medium text-ink-2">
          <ShieldCheck className="h-3.5 w-3.5 text-ready" /> Scan to order and pay
        </p>
      </figcaption>
      {table.qrToken && (
        <button
          type="button"
          data-print="hide"
          onClick={replace}
          disabled={rotating}
          aria-label={`Replace the QR code for table ${label}`}
          title="Replace this QR code"
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-3 opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <RefreshCw className={cx('h-4 w-4', rotating && 'animate-spin')} />
        </button>
      )}
    </figure>
  );
}

function Chips<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-9 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
            value === o.value ? 'bg-ink text-surface ring-ink' : 'bg-surface text-ink-2 ring-line hover:bg-surface-2'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
