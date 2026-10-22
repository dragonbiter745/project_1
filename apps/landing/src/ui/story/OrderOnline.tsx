import { ArrowUpRight, BadgePercent, Gift, QrCode, ReceiptText, TicketPercent } from 'lucide-react';
import { orderOnline } from '../../lib/links';
import { useReveal } from '../../lib/hooks';

// The same promises as the diner site's sign-in sheet: only what exists today, points marked as planned.
const PERKS = [
  { icon: TicketPercent, title: 'Member-only coupons', text: 'Some coupons are only for account holders.' },
  { icon: BadgePercent, title: 'Special discounts', text: 'Hear first when the court or a shop runs an offer.' },
  { icon: Gift, title: 'Loyalty rewards', text: "Points on every order are planned. We'll tell you before they start.", soon: true },
  { icon: ReceiptText, title: 'Your orders on any phone', text: 'Receipts, refunds and one-tap reorder.' },
];

const STEPS = [
  { verb: 'Pick', text: 'Dishes from any counter go into one cart.' },
  { verb: 'Pay', text: 'Once, online. Each shop gives you its own token.' },
  { verb: 'Collect', text: 'Live updates tell you when each dish is up.' },
];

/** Ordering online for pickup, and why an account is worth it. The shops and menus live on the diner site. */
export function OrderOnline() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="order" aria-labelledby="order-title" className="scroll-mt-24 bg-bg px-4 py-20 md:px-6 md:py-28">
      <div ref={ref} className="reveal mx-auto max-w-[1180px]">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <h2 id="order-title" className="font-display text-[clamp(48px,8vw,112px)] font-extrabold leading-[0.9] text-ink">
            Every counter.
            <br />
            <span className="text-accent">One cart.</span>
          </h2>
          <div className="max-w-xs md:pb-3">
            <p className="text-lg text-ink-2">Order ahead from the whole food court, pay once, collect with your token.</p>
            <a
              href={orderOnline()}
              className="pressable mt-6 inline-flex h-14 items-center gap-2 rounded-full bg-accent px-7 text-base font-semibold text-on-accent shadow-float hover:bg-accent-ink"
            >
              Order online
              <ArrowUpRight className="h-5 w-5" strokeWidth={2.25} />
            </a>
          </div>
        </div>

        <ol className="mt-14 grid gap-8 border-t-2 border-ink pt-8 md:grid-cols-3 md:gap-10">
          {STEPS.map(({ verb, text }) => (
            <li key={verb}>
              <p className="font-display text-[44px] font-extrabold leading-none text-ink">{verb}</p>
              <p className="mt-3 max-w-[28ch] text-base text-ink-2">{text}</p>
            </li>
          ))}
        </ol>

        <div className="mt-16 grid gap-10 rounded-[32px] bg-ink px-6 py-10 text-white md:px-12 md:py-14 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h3 className="font-display text-[clamp(36px,5vw,60px)] font-extrabold leading-[0.95]">Members get more.</h3>
            <p className="mt-4 max-w-sm text-lg text-white/75">A free account keeps your orders together and unlocks offers guests don't see.</p>
            <a href={orderOnline()} className="pressable mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-base font-semibold text-ink hover:bg-white/90">
              Create free account
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </a>
            <p className="mt-5 max-w-sm text-xs text-white/60">Coupons and offers depend on what the court and its shops run. Loyalty points are not live yet.</p>
          </div>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            {PERKS.map(({ icon: Icon, title, text, soon }) => (
              <div key={title} className="flex gap-4 border-b border-white/15 py-5">
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-[rgb(var(--accent-line))]" strokeWidth={1.5} />
                <div>
                  <dt className="text-base font-semibold">
                    {title}
                    {soon && <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-accent px-2 align-middle text-[11px] font-semibold text-on-accent">Coming soon</span>}
                  </dt>
                  <dd className="mt-1 text-sm text-white/70">{text}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>

        <p className="mt-8 flex items-start gap-3 text-base text-ink-2">
          <QrCode className="mt-0.5 h-6 w-6 shrink-0 text-ink" strokeWidth={1.5} />
          <span>
            <span className="font-semibold text-ink">Already at the court?</span> Scan the QR on your table to order from your seat. Guests can order there
            without an account.
          </span>
        </p>
      </div>
    </section>
  );
}
