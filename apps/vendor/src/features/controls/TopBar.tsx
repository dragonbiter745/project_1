import { ArrowLeftRight, BarChart3, Loader2, PackageX, PauseCircle, PlayCircle, Volume2, VolumeX } from 'lucide-react';
import type { Vendor } from '@foodcourt/shared';
import type { SyncStatus } from '@foodcourt/firebase-client/local-store';
import { Button, IconButton, cx } from '@foodcourt/ui';

interface TopBarProps {
  vendor: Vendor;
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

const formatTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

export function TopBar(props: TopBarProps) {
  const { vendor, sync, alarmOn, soldOutCount } = props;
  const paused = !vendor.acceptingOrders;

  return (
    <>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-bg px-4 lg:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-ink">{vendor.name}</p>
            <SyncLabel sync={sync} />
          </div>
          <IconButton label="Switch shop" onClick={props.onSwitchShop}>
            <ArrowLeftRight className="h-4 w-4" strokeWidth={2} />
          </IconButton>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            label={alarmOn ? 'Mute new-order alarm' : 'Turn on new-order alarm'}
            onClick={props.onToggleAlarm}
            tone="quiet"
            className={cx(!alarmOn && '[&>span]:bg-danger-tint [&>span]:text-danger')}
          >
            {alarmOn ? <Volume2 className="h-[18px] w-[18px]" strokeWidth={2} /> : <VolumeX className="h-[18px] w-[18px]" strokeWidth={2} />}
          </IconButton>
          <Button variant="quiet" onClick={props.onOpenToday} icon={<BarChart3 className="h-4 w-4" strokeWidth={2} />}>
            Today
          </Button>
          <Button variant="quiet" onClick={props.onOpenStock} icon={<PackageX className="h-4 w-4" strokeWidth={2} />}>
            Stock
            {soldOutCount > 0 && (
              <span className="ml-0.5 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1.5 font-mono text-xs text-on-accent">
                {soldOutCount}
              </span>
            )}
          </Button>
          {paused ? (
            <Button variant="positive" onClick={props.onResume} icon={<PlayCircle className="h-4 w-4" strokeWidth={2} />}>
              Resume
            </Button>
          ) : (
            <Button variant="quiet" onClick={props.onPause} icon={<PauseCircle className="h-4 w-4" strokeWidth={2} />}>
              Pause
            </Button>
          )}
        </div>
      </header>

      {paused && (
        <p role="status" className="shrink-0 bg-danger-tint px-5 py-2.5 text-sm font-medium text-danger">
          Not taking new orders
          {vendor.pausedUntil ? ` until ${formatTime(vendor.pausedUntil)}` : ' until you resume'}. Diners can still browse.
        </p>
      )}
      {!alarmOn && (
        <p role="status" className="shrink-0 bg-prep-tint px-5 py-2.5 text-sm font-medium text-prep">
          New-order alarm is muted.
        </p>
      )}
    </>
  );
}

function SyncLabel({ sync }: { sync: SyncStatus }) {
  if (sync === 'connected') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        <span className="h-1.5 w-1.5 rounded-full bg-ready" aria-hidden />
        Live
      </p>
    );
  }
  if (sync === 'connecting') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-prep">
        <Loader2 className="h-3 w-3 spinner" strokeWidth={2.5} aria-hidden />
        Connecting
      </p>
    );
  }
  return <p className="text-xs font-medium text-danger">Offline. Orders from other screens may be delayed.</p>;
}
