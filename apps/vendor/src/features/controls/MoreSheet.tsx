import { ArrowLeftRight, BarChart3, ChevronRight, PackageX, PauseCircle, PlayCircle, Volume2, VolumeX, type LucideIcon } from 'lucide-react';
import type { Vendor } from '@foodcourt/shared';
import { Sheet, cx } from '@foodcourt/ui';

interface MoreSheetProps {
  vendor: Vendor;
  open: boolean;
  alarmOn: boolean;
  soldOutCount: number;
  onClose: () => void;
  onToday: () => void;
  onStock: () => void;
  onPause: () => void;
  onResume: () => void;
  onToggleAlarm: () => void;
  onSwitchShop: () => void;
}

// Phone home for the controls that sit in the tablet top bar.
export function MoreSheet(props: MoreSheetProps) {
  const { vendor, alarmOn, soldOutCount } = props;
  const paused = !vendor.acceptingOrders;
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Kitchen controls" description={vendor.name}>
      <ul className="space-y-2">
        <Row icon={BarChart3} tone="bg-accent-tint text-accent-ink" label="Today" hint="Sales, speed and finished orders" onClick={props.onToday} />
        <Row
          icon={PackageX}
          tone={soldOutCount > 0 ? 'bg-danger-tint text-danger' : 'bg-surface-2 text-ink-2'}
          label="Stock"
          hint={soldOutCount > 0 ? `${soldOutCount} ${soldOutCount === 1 ? 'dish' : 'dishes'} sold out` : 'Mark dishes sold out'}
          onClick={props.onStock}
        />
        {paused ? (
          <Row icon={PlayCircle} tone="bg-ready-tint text-ready" label="Resume orders" hint="Start taking new orders again" onClick={props.onResume} />
        ) : (
          <Row icon={PauseCircle} tone="bg-prep-tint text-prep" label="Pause orders" hint="Stop new orders for a while" onClick={props.onPause} />
        )}
        <Row
          icon={alarmOn ? Volume2 : VolumeX}
          tone={alarmOn ? 'bg-surface-2 text-ink-2' : 'bg-danger-tint text-danger'}
          label={alarmOn ? 'Mute new-order alarm' : 'Turn alarm back on'}
          hint={alarmOn ? 'The phone rings until each order is accepted' : 'Alarm is muted right now'}
          onClick={props.onToggleAlarm}
        />
        <Row icon={ArrowLeftRight} tone="bg-surface-2 text-ink-2" label="Switch shop" hint="Use this phone for another kitchen" onClick={props.onSwitchShop} />
      </ul>
    </Sheet>
  );
}

function Row({ icon: Icon, tone, label, hint, onClick }: { icon: LucideIcon; tone: string; label: string; hint: string; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="pressable flex w-full items-center gap-4 rounded-card bg-bg p-3 text-left ring-1 ring-inset ring-line/60 transition-colors duration-150 hover:bg-surface-2"
      >
        <span className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-[13px] transition-colors', tone)}>
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-ink">{label}</span>
          <span className="block truncate text-sm text-ink-3">{hint}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" strokeWidth={2} />
      </button>
    </li>
  );
}
