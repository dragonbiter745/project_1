import { BrandMark } from '@foodcourt/ui';
import { orderAtTable } from '../../lib/links';

export function Footer() {
  return (
    <footer className="bg-bg px-5 pb-10 pt-8 md:px-10">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-sm text-ink-3">
        <p className="flex items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="font-semibold text-ink">REVA Food Court</span>
          <span>· Every kitchen, one QR, one payment</span>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <a href="#story" className="hover:text-ink">
            How it works
          </a>
          <a href="#live" className="hover:text-ink">
            3D preview
          </a>
          <a href={orderAtTable()} className="hover:text-ink">
            How to order
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-[1240px] text-xs text-ink-3">The 3D court is a simulated preview. Its shops, dishes, prices, diners and orders are illustrative and not real activity.</p>
    </footer>
  );
}
