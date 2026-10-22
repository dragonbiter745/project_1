import { useEffect, useRef, type CSSProperties } from 'react';
import { cx } from '@foodcourt/ui';
import { useReveal } from '../../lib/hooks';
import { useUi } from '../../store/ui';

/** Thin saffron bar across the top showing how far down the page you are. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.current?.style.setProperty('transform', `scaleX(${max > 0 ? window.scrollY / max : 0})`);
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[45] h-[3px]">
      <div ref={bar} className="h-full origin-left bg-gradient-to-r from-ink via-accent-ink to-accent" style={{ transform: 'scaleX(0)' }} />
    </div>
  );
}

/** Headline whose words rise into place one after another when it scrolls into view. */
export function RevealWords({ text, className, accent }: { text: string; className?: string; accent?: string[] }) {
  const ref = useReveal<HTMLHeadingElement>();
  const words = text.split(' ');
  return (
    <h2 ref={ref} className={cx('reveal-words reveal', className)} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <span className={cx('word inline-block', accent?.includes(w) && 'text-gradient')} style={{ ['--w' as string]: i } as CSSProperties}>
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </h2>
  );
}

/** A soft saffron light that trails the cursor on desktop. */
export function CursorGlow() {
  const el = useRef<HTMLDivElement>(null);
  const explore = useUi((s) => s.explore);
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      el.current?.style.setProperty('transform', `translate3d(${x - 250}px, ${y - 250}px, 0)`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div
      ref={el}
      aria-hidden
      className={cx('pointer-events-none fixed left-0 top-0 z-[1] hidden h-[500px] w-[500px] rounded-full opacity-60 mix-blend-multiply transition-opacity duration-500 [@media(pointer:fine)]:block', explore && 'opacity-0')}
      style={{ background: 'radial-gradient(circle, rgb(246 166 9 / 0.28), transparent 62%)' }}
    />
  );
}
