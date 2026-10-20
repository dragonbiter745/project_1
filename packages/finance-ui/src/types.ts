import type { Books } from './books/useBooks';
import type { Range } from './lib/range';
import type { ReportState } from './lib/useReport';

export interface PageProps {
  range: Range;
  report: ReportState;
  books: Books;
  /** Jump to another finance tab, e.g. from the pipeline strip. */
  go: (tab: 'overview' | 'transactions' | 'payouts' | 'books' | 'founders') => void;
}
