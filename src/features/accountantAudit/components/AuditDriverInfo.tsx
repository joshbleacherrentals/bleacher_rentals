import { Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { AuditDriverInfo as AuditDriverInfoData } from "../db/auditDriverInfo";

type Contact = Pick<AuditDriverInfoData, "address" | "phone" | "email">;

const ITEMS: { key: keyof Contact; label: string; Icon: LucideIcon }[] = [
  { key: "address", label: "Address", Icon: MapPin },
  { key: "phone", label: "Phone", Icon: Phone },
  { key: "email", label: "Email", Icon: Mail },
];

/**
 * The driver's Address, Phone and Email, in the card under the driver's name: a hairline above, a
 * small grey label over each value. docs/specs/accountant-audit-02-driver-select.md §3 (D7, R9)
 */
export function AuditDriverInfo({ info }: { info: Contact }) {
  return (
    <div
      data-testid="audit-driver-info"
      className="mt-4 flex flex-wrap gap-x-10 gap-y-4 border-t border-gray-100 pt-4"
    >
      {ITEMS.map(({ key, label, Icon }) => (
        <div key={key} className="flex min-w-0 items-start gap-2.5">
          <Icon aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] shrink-0 text-gray-400" />
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
              {label}
            </span>
            <span className="text-sm text-gray-900">{info[key] ?? "–"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
