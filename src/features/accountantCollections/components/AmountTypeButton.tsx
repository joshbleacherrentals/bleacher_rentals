import { ListFilter } from "lucide-react";
import { nextAmountType, type CollectionsAmountType } from "../utils/collectionsListState";

/**
 * The switch of the Collections tab: one button that steps Collections, Deposits, All and back on
 * every click, like the status button on /quotes-bookings. Its label and colour show the current
 * one; the colour stays with its place in the cycle.
 * docs/specs/accountant-collections-23-amount-type-switch.md §1 (Look) and §3. The design is
 * `docs/design/accountant-collections/Main.dc.html`, whose "Full amount" is called Collections here.
 */

const LABEL: Record<CollectionsAmountType, string> = {
  collections: "Collections",
  deposits: "Deposits",
  all: "All",
};

// Whole class strings, so that Tailwind finds them.
const COLOUR: Record<CollectionsAmountType, string> = {
  collections: "bg-gradient-to-r from-[#2f6fb8] to-[#1d62a3]",
  deposits: "bg-gradient-to-r from-[#0e7f61] to-[#0b6e55]",
  all: "bg-gradient-to-r from-[#6b7280] to-[#4b5563]",
};

export function AmountTypeButton({
  type,
  onChange,
}: {
  type: CollectionsAmountType;
  onChange: (next: CollectionsAmountType) => void;
}) {
  const next = nextAmountType(type);
  return (
    <button
      type="button"
      title={`Click to show ${LABEL[next]}`}
      aria-label={`Showing: ${LABEL[type]}. Click to switch to ${LABEL[next]}.`}
      onClick={() => onChange(next)}
      className={`inline-flex h-9 cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold text-white shadow-[0_2px_6px_rgba(15,42,68,0.22)] ${COLOUR[type]}`}
    >
      <ListFilter aria-hidden="true" className="h-4 w-4" />
      <span>{LABEL[type]}</span>
    </button>
  );
}
