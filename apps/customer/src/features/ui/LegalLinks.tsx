import { LEGAL_LABELS, LEGAL_PAGES, legalUrl, type LegalPage } from '@foodcourt/shared';
import { cx } from '@foodcourt/ui';

/** One legal page, opened in a new tab so the cart and any half-filled form stay put. */
export function LegalLink({ page, children }: { page: LegalPage; children?: string }) {
  return (
    <a href={legalUrl(page)} target="_blank" rel="noopener" className="font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink">
      {children ?? LEGAL_LABELS[page]}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The footer every diner screen carries: all the legal pages. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cx('flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs', className)}>
      {LEGAL_PAGES.map((page) => (
        <LegalLink key={page} page={page} />
      ))}
    </nav>
  );
}
