import { useUi } from '../../store/ui';

/** Small progress card beside the headline while the 3D court loads; never covers the text. */
export function Loader() {
  const progress = useUi((s) => s.sceneProgress);
  return (
    <div
      role="status"
      aria-live="polite"
      className="glass enter-up pointer-events-none absolute bottom-24 left-1/2 z-30 w-[260px] -translate-x-1/2 rounded-[20px] px-4 py-3.5 lg:bottom-auto lg:left-auto lg:right-10 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-0"
    >
      <p className="flex items-center justify-between text-sm font-semibold text-ink">
        Loading the 3D court
        <span className="font-mono text-xs tabular-nums text-ink-3">{Math.round(progress * 100)}%</span>
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/10">
        {progress > 0 ? (
          <span className="block h-full origin-left rounded-full bg-accent-ink transition-transform duration-300 ease-out" style={{ transform: `scaleX(${progress})` }} />
        ) : (
          <span className="loader-bar block h-full w-1/3 rounded-full bg-accent-ink" />
        )}
      </div>
    </div>
  );
}
