import { orderOnline } from '../../lib/links';

export function Footer() {
  return (
    <footer className="bg-bg px-5 pb-10 pt-8 md:px-10">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 border-t border-line pt-8 text-sm text-ink-3">
        <p className="flex items-center gap-4">
          <img src="/qrave-lockup.png" alt="Qrave. Scan it. Crave it." width="560" height="345" className="h-16 w-auto select-none" draggable={false} />
          <span className="hidden sm:inline">Every kitchen, one QR, one payment</span>
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <a href="#story" className="hover:text-ink">
            How it works
          </a>
          <a href="#live" className="hover:text-ink">
            3D preview
          </a>
          <a href={orderOnline()} className="hover:text-ink">
            Order online
          </a>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-[1240px] text-xs text-ink-3">The 3D court is a simulated preview. Its shops, dishes, prices, diners and orders are illustrative and not real activity.</p>
    </footer>
  );
}
