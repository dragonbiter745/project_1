import { ArrowLeftRight, BarChart3, Loader2, PackageX, PauseCircle, PlayCircle, Volume2, VolumeX, WifiOff } from 'lucide-react';
import type { Vendor } from '@foodcourt/shared';
import type { SyncStatus } from '@foodcourt/firebase-client/local-store';
import { Button, IconButton, Monogram, cx, useNow } from '@foodcourt/ui';

interface TopBarProps {
  vendor: Vendor;
  /** Phone layout: slim header; the other controls live in the More sheet. */
  phone?: boolean;
  sync: SyncStatus;
  alarmOn: boolean;
  soldOutCount: number;
  onToggleAlarm: () => void;
  onOpenStock: () => void;
  onOpenToday: () => void;
  onPause: () => void;
  onResume: () => void;
  onSwitchShop: () => void;
}

const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const formatTime = (iso: string) => timeFormat.format(new Date(iso));

export function TopBar(props: TopBarProps) {
  const { vendor, sync, alarmOn, soldOutCount, phone } = props;
  const paused = !vendor.acceptingOrders;
  const now = useNow(15_000);

  return (
    <>
      <header
        className={cx(
          'relative z-header flex shrink-0 items-center justify-between gap-3 border-b border-line/70 bg-surface/80 backdrop-blur-xl',
          phone ? 'h-[60px] px-3 pt-[env(safe-area-inset-top)]' : 'h-[72px] px-4 lg:px-6'
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Monogram code={vendor.code} tone="solid" size={phone ? 'sm' : 'md'} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-tight tracking-tight text-ink">{vendor.name}</p>
            <SyncLabel sync={sync} paused={paused} />
          </div>
          {!phone && (
            <IconButton label="Switch shop" onClick={props.onSwitchShop}>
              <ArrowLeftRight className="h-4 w-4" strokeWidth={2} />
            </IconButton>
          )}
        </div>

        <p className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 font-mono text-[28px] font-semibold tabular-nums tracking-tight text-ink xl:block" aria-label="Current time">
          {timeFormat.format(now)}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {phone && <p className="font-mono text-base font-semibold tabular-nums text-ink-2">{timeFormat.format(now)}</p>}
          <IconButton
            label={alarmOn ? 'Mute new-order alarm' : 'Turn on new-order alarm'}
            onClick={props.onToggleAlarm}
            tone="quiet"
            className={cx(!alarmOn && '[&>span]:bg-danger-tint [&>span]:text-danger')}
          >
            {alarmOn ? <Volume2 className="h-[18px] w-[18px]" strokeWidth={2} /> : <VolumeX className="h-[18px] w-[18px]" strokeWidth={2} />}
          </IconButton>
          {!phone && (
          <>
          <div className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
            <Button variant="ghost" onClick={props.onOpenToday} icon={<BarChart3 className="h-4 w-4" strokeWidth={2} />} className="hover:bg-surface">
              Today
            </Button>
            <Button variant="ghost" onClick={props.onOpenStock} icon={<PackageX className="h-4 w-4" strokeWidth={2} />} className="hover:bg-surface">
              Stock
              {soldOutCount > 0 && (
                <span className="ml-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1.5 font-mono text-xs text-on-accent">
                  {soldOutCount}
                </span>
              )}
            </Button>
          </div>
          {paused ? (
            <Button variant="positive" onClick={props.onResume} icon={<PlayCircle className="h-4 w-4" strokeWidth={2} />}>
              Resume orders
            </Button>
          ) : (
            <Button variant="outline" onClick={props.onPause} icon={<PauseCircle className="h-4 w-4" strokeWidth={2} />}>
              Pause
            </Button>
          )}
          </>
          )}
        </div>
      </header>

      {paused && (
        <p role="status" className="shrink-0 border-b border-danger/15 bg-danger-tint px-6 py-2.5 text-sm font-medium text-danger">
          Not taking new orders
          {vendor.pausedUntil ? ` until ${formatTime(vendor.pausedUntil)}` : ' until you resume'}. Diners can still browse.
        </p>
      )}
      {!alarmOn && (
        <p role="status" className="shrink-0 border-b border-prep/15 bg-prep-tint px-6 py-2.5 text-sm font-medium text-prep">
          New-order alarm is muted. Turn it back on with the speaker button.
        </p>
      )}
    </>
  );
}

function SyncLabel({ sync, paused }: { sync: SyncStatus; paused: boolean }) {
  if (sync === 'disconnected') {
    return (
      <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-danger">
        <WifiOff className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        Offline. Orders from other screens may be delayed.
      </p>
    );
  }
  if (sync === 'connecting') {
    return (
      <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-prep">
        <Loader2 className="spinner h-3 w-3" strokeWidth={2.5} aria-hidden />
        Connecting
      </p>
    );
  }
  return (
    <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-ink-3">
      <span className={cx('h-2 w-2 rounded-full', paused ? 'bg-danger' : 'live-dot bg-ready')} aria-hidden />
      {paused ? 'Paused' : 'Live kitchen display'}
    </p>
  );
}
