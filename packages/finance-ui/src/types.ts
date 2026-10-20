import type { Range } from './lib/range';
import type { ReportState } from './lib/useReport';

export interface PageProps {
  range: Range;
  report: ReportState;
}
