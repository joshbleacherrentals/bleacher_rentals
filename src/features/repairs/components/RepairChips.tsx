import type { RepairSeverity } from "../utils/repairRows";
import { severityPill, statusPill } from "../utils/repairFormat";

/**
 * The small pieces the Repairs table is made of: the chips and the coloured pills. Sizes and colours
 * are the canvas's (docs/design/repairs/Main.dc.html, spec 04 §2.5). A pill carries its word, so
 * colour is never the only signal.
 */

/** `#52`; `#?` for a bleacher whose number has not synced yet. */
export function BleacherChip({ number }: { number: number | null }) {
  return (
    <span className="inline-block rounded bg-[#f3f4f6] px-2 py-0.5 text-xs leading-4 font-semibold text-[#10365a]">
      {`#${number ?? "?"}`}
    </span>
  );
}

export function CategoryChip({ name }: { name: string | null }) {
  return (
    <span className="inline-block rounded-full border border-[#d1d5db] bg-white px-2 py-px text-xs leading-[18px] whitespace-nowrap text-[#374151]">
      {name ?? "—"}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: RepairSeverity }) {
  const pill = severityPill(severity);
  return (
    <span
      className={`inline-block rounded-full px-2 py-px text-xs leading-[18px] font-medium ${pill.className}`}
    >
      {pill.label}
    </span>
  );
}

/** A plain pill, with no chevron: it becomes a menu in spec 08. */
export function StatusPill({ status }: { status: string }) {
  const pill = statusPill(status);
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] leading-5 font-medium whitespace-nowrap ${pill.className}`}
    >
      {pill.label}
    </span>
  );
}
