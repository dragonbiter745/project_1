import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { BrandMark, cx } from '@foodcourt/ui';
import { orderOnline } from '../../lib/links';

const LINKS = [
  { href: '#order', label: 'Order online' },
  { href: '#story', label: 'How it works' },
  { href: '#kitchens', label: 'For kitchens' },
  { href: '#managers', label: 'For the court' },
  { href: '#live', label: '3D preview' },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 md:px-6 md:pt-4">
      <nav
        aria-label="Main"
        className={cx(
          'pointer-events-auto mx-auto flex h-14 max-w-[1240px] items-center justify-between rounded-full pl-2 pr-2 transition-[background-color,box-shadow,backdrop-filter] duration-300',
          scrolled ? 'glass-strong' : 'bg-transparent'
        )}
      >
        <a href="#live" className="flex items-center gap-2.5 rounded-full pr-3">
          <BrandMark size="sm" />
          <span className="text-[15px] font-semibold tracking-tight text-ink">REVA Food Court</span>
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="chip">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <a href={orderOnline()} className="pressable inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-ink">
          Order online
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
        </a>
      </nav>
    </header>
  );
}
