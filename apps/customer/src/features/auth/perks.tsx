import { BadgePercent, Gift, ReceiptText, TicketPercent, type LucideIcon } from 'lucide-react';
import { cx } from '../../lib/format';

export interface Perk {
  icon: LucideIcon;
  title: string;
  text: string;
  soon?: boolean;
}

// Only what is true today: coupons can be limited to members, shops can run offers, and points are
// planned but not live. No amounts, because none are promised.
export const PERKS: Perk[] = [
  { icon: TicketPercent, title: 'Member-only coupons', text: 'Some coupons are only for account holders. They land in your account.' },
  { icon: BadgePercent, title: 'Special discounts', text: 'Hear first when the court or a shop runs an offer.' },
  { icon: Gift, title: 'Loyalty rewards', text: "Points on every order are planned. We'll tell you before they start.", soon: true },
  { icon: ReceiptText, title: 'Your orders on any phone', text: 'Receipts, refunds and one-tap reorder.' },
];

export function SoonTag() {
  return (
    <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-accent px-2 align-middle text-2xs font-semibold text-ink">
      Coming soon
    </span>
  );
}

/** The account perks as a compact list, used on the sign-in sheets. */
export function PerkList({ perks = PERKS, className }: { perks?: Perk[]; className?: string }) {
  return (
    <ul className={cx('space-y-3.5', className)}>
      {perks.map(({ icon: Icon, title, text, soon }, i) => (
        <li key={title} className="enter-up flex items-start gap-3" style={{ ['--i' as string]: i }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-ink ring-1 ring-inset ring-accent-line">
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-medium text-ink">
              {title}
              {soon && <SoonTag />}
            </span>
            <span className="block text-sm text-ink-3">{text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
