import { InfoTooltip } from "@/components/InfoTooltip";
import type { Currency } from "@/features/quotesAndBookings/types/quoteTypes";
import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import type { MoneyView } from "../utils/invoiceView";

/**
 * The Money section: six lines, the (i) tooltips, and the red Current Overdue box.
 * docs/specs/accountant-collections-09-design.md §3.
 */

export const MONEY_HELP = {
  contractSubtotal: "Total after discounts, not including taxes.",
  total: "Total after discounts, including taxes.",
  alreadyPaid: "Funds that have been credited as of now.",
  remaining:
    "What the customer still needs to pay: the total (after discounts and taxes) minus what is already paid.",
  currentOverdue:
    "What the customer was supposed to have paid as of now, according to the payment schedule. For example, if the schedule called for 3,000 yesterday and another 3,000 tomorrow, the current overdue amount is 3,000.",
} as const;

const LINE = "flex items-center justify-between gap-4 py-2.5 text-sm";

function Label({
  children,
  help,
  helpLabel,
  className = "",
}: {
  children: string;
  help?: string;
  helpLabel?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {children}
      {help && <InfoTooltip content={help} label={helpLabel ?? `About ${children}`} />}
    </span>
  );
}

export function MoneyCard({ money, currency }: { money: MoneyView; currency: Currency }) {
  const fmt = (cents: number) => formatMoney(cents, currency);
  return (
    <section aria-label="Money" className="rounded-[10px] border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Money</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-6">
        <div className="flex max-w-[480px] flex-col">
          <div className={`${LINE} border-b border-gray-100`}>
            <Label className="text-gray-600" help={MONEY_HELP.contractSubtotal}>
              Contract Subtotal
            </Label>
            <span className="font-medium tabular-nums">{fmt(money.contractSubtotalCents)}</span>
          </div>
          <div className={`${LINE} border-b border-gray-100`}>
            <span className="text-gray-600">{money.taxesLabel}</span>
            <span className="font-medium tabular-nums">{fmt(money.taxesCents)}</span>
          </div>
          <div className={`${LINE} border-b border-gray-300`}>
            <Label className="font-semibold" help={MONEY_HELP.total}>
              Total
            </Label>
            <span className="font-bold tabular-nums">{fmt(money.totalCents)}</span>
          </div>
          <div className={`${LINE} border-b border-gray-100`}>
            <Label className="text-gray-600" help={MONEY_HELP.alreadyPaid}>
              Already paid
            </Label>
            <span className="font-medium tabular-nums text-green-800">
              {fmt(money.alreadyPaidCents)}
            </span>
          </div>
          <div className={LINE}>
            <Label className="font-semibold" help={MONEY_HELP.remaining}>
              Remaining Payment
            </Label>
            <span className="font-bold tabular-nums">{fmt(money.remainingCents)}</span>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-1.5 rounded-[10px] bg-red-100 p-5 text-red-700">
          <Label className="text-sm font-semibold" help={MONEY_HELP.currentOverdue}>
            Current Overdue amount
          </Label>
          <span className="text-[28px] font-bold leading-9 tabular-nums">
            {fmt(money.currentOverdueCents)}
          </span>
        </div>
      </div>
    </section>
  );
}
