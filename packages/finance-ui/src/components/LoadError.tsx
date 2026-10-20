import { RefreshCw } from 'lucide-react';
import { Button, cx } from '@foodcourt/ui';

export function LoadError({ text, onRetry, compact }: { text: string; onRetry: () => void; compact?: boolean }) {
  return (
    <div role="alert" className={cx('flex flex-wrap items-center gap-3 rounded-card bg-danger-tint px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/20', compact ? 'mb-4' : '')}>
      <span className="flex-1 font-medium">Couldn't load the figures. {text}</span>
      <Button variant="outline" size="sm" onClick={onRetry} icon={<RefreshCw className="h-4 w-4" />}>
        Try again
      </Button>
    </div>
  );
}
