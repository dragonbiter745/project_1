import { useState } from 'react';
import { setMaintenance, setPaymentsEnabled } from '@foodcourt/firebase-client/ops';
import { Button, Sheet, cx, run } from '@foodcourt/ui';
import { jsonEqual, useLocal } from '../../lib/store';

type Pending = { flag: 'payments' | 'maintenance'; next: boolean } | null;

const COPY = {
  payments: {
    title: (on: boolean) => (on ? 'Turn on online payments?' : 'Turn off online payments?'),
    body: (on: boolean) =>
      on
        ? 'Diners pay with UPI or card through Cashfree before their order reaches the kitchen.'
        : 'Diners order now and pay at each shop counter. Use this if the payment gateway is down.',
  },
  maintenance: {
    title: (on: boolean) => (on ? 'Turn on maintenance mode?' : 'Turn off maintenance mode?'),
    body: (on: boolean) =>
      on
        ? 'New orders stop in every shop and diners see a notice. Orders already placed carry on.'
        : 'Every shop that is not paused starts taking orders again.',
  },
};

export function Settings() {
  const config = useLocal((s) => s.config, jsonEqual);
  const [pending, setPending] = useState<Pending>(null);

  const apply = () => {
    if (!pending) return;
    void run(pending.flag === 'payments' ? setPaymentsEnabled(pending.next) : setMaintenance(pending.next));
    setPending(null);
  };

  return (
    <div className="max-w-3xl space-y-8">
      <section aria-labelledby="ops">
        <h2 id="ops" className="text-lg font-semibold tracking-tight text-ink">
          Operations
        </h2>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-inset ring-line">
          <ToggleRow
            title="Online payments"
            description={config.flags.paymentsEnabled ? 'Diners pay online before ordering.' : 'Diners pay at the counter.'}
            checked={config.flags.paymentsEnabled}
            onChange={(next) => setPending({ flag: 'payments', next })}
          />
          <ToggleRow
            title="Maintenance mode"
            description={config.flags.maintenance ? 'New orders are stopped in every shop.' : 'All shops can take orders.'}
            checked={config.flags.maintenance}
            danger
            onChange={(next) => setPending({ flag: 'maintenance', next })}
          />
        </ul>
      </section>

      <section aria-labelledby="pricing">
        <h2 id="pricing" className="text-lg font-semibold tracking-tight text-ink">
          Pricing and points
        </h2>
        <dl className="mt-3 divide-y divide-line overflow-hidden rounded-card bg-surface text-sm ring-1 ring-inset ring-line">
          <Row label="GST rate" value={`${config.gstPct}%`} />
          <Row label="Menu prices" value={config.taxInclusive ? 'Include GST' : 'GST added at checkout'} />
          <Row label="Qrave points" value={`1 point per ₹${Math.round(1 / (config.pointsPerRupee || 0.1))} spent`} />
          <Row label="Points expire after" value={`${config.pointsExpiryDays} days`} />
        </dl>
        <p className="mt-2 text-sm text-ink-3">These are set in the config/global document and change with a deploy.</p>
      </section>

      <Sheet
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending ? COPY[pending.flag].title(pending.next) : ''}
        description={pending ? COPY[pending.flag].body(pending.next) : undefined}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" onClick={() => setPending(null)}>
              Keep as is
            </Button>
            <Button variant={pending?.flag === 'maintenance' && pending.next ? 'danger' : 'ink'} size="lg" onClick={apply}
              className={cx(pending?.flag === 'maintenance' && pending.next && 'bg-danger-tint ring-1 ring-inset ring-danger/30')}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <span />
      </Sheet>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  danger,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  danger?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-base font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-3">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className="grid h-11 w-16 shrink-0 place-items-center"
      >
        <span
          className={cx(
            'relative block h-7 w-12 rounded-full transition-colors duration-200',
            checked ? (danger ? 'bg-danger' : 'bg-ready') : 'bg-line-strong'
          )}
        >
          <span
            className="switch-thumb absolute left-0.5 top-0.5 block h-6 w-6 rounded-full bg-surface shadow-thumb"
            style={{ transform: checked ? 'translateX(20px)' : undefined }}
          />
        </span>
      </button>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3.5">
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
