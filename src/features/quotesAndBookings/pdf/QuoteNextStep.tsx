"use client";

import { ArrowRight, CheckCircle } from "lucide-react";
import type { QuoteLanguage } from "./quoteLanguage";
import { quoteText } from "./quoteStrings";
import type { QuoteCta } from "./quoteCta";

/** What the Quote tab is told to show: the step to take, and how to go to it. */
export type QuoteNextStepProps = {
  kind: Exclude<QuoteCta, null>;
  onClick: () => void;
};

/**
 * The big "what do I do now?" button. The same green as the QUOTE / INVOICE badge in the header
 * (`green-700`), so it stands apart from the blue tab bar and is the most obvious thing on the page:
 * customers were asking how to sign.
 */
export function QuoteCtaButton({
  kind,
  onClick,
  language,
  fullWidth = false,
  label,
}: {
  kind: "approve" | "pay";
  onClick: () => void;
  language: QuoteLanguage;
  fullWidth?: boolean;
  /** Replaces the default wording for the kind, e.g. "Continue to Payment" after signing. */
  label?: string;
}) {
  const s = quoteText(language);
  return (
    <button
      type="button"
      data-testid="quote-cta"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-green-700 px-8 py-4 text-xl font-bold text-white shadow-md transition hover:brightness-90 cursor-pointer ${
        fullWidth ? "w-full" : ""
      }`}
    >
      {label ?? (kind === "approve" ? s.approveQuoteCta : s.payInvoiceCta)}
      <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
    </button>
  );
}

/** Signed and fully paid: nothing to click, so say so instead of leaving a gap. */
export function PaidInFullNote({ language }: { language: QuoteLanguage }) {
  const s = quoteText(language);
  return (
    <span
      data-testid="quote-paid-note"
      className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-sm font-medium text-green-800"
    >
      <CheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {s.paidInFull}
    </span>
  );
}

/**
 * Phone only: the button pinned to the bottom of the screen, because the quote is a long table and
 * an inline button would sit far below where the customer is looking. Desktop uses the buttons in
 * the page itself.
 */
export function QuoteCtaStickyBar({
  kind,
  onClick,
  language,
}: {
  kind: "approve" | "pay";
  onClick: () => void;
  language: QuoteLanguage;
}) {
  return (
    <div
      data-testid="quote-cta-sticky"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.08)] sm:hidden"
    >
      <QuoteCtaButton kind={kind} onClick={onClick} language={language} fullWidth />
    </div>
  );
}
