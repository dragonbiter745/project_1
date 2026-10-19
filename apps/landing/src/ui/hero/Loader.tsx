import { BrandMark } from '@foodcourt/ui';

export function Loader() {
  return (
    <div role="status" aria-live="polite" className="field-saffron absolute inset-0 z-10 grid place-items-center">
      <div className="text-center">
        <BrandMark size="lg" className="mx-auto" />
        <p className="mt-5 text-lg font-semibold tracking-tight text-ink">Opening the court</p>
        <p className="mt-1 text-sm text-ink-3">Laying the terrazzo, lighting the tandoor, seating the lunch crowd.</p>
        <div className="mx-auto mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-white/70">
          <span className="loader-bar block h-full w-1/3 rounded-full bg-accent-ink" />
        </div>
      </div>
    </div>
  );
}
