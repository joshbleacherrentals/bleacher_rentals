import { Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { AuditDriverInfo as AuditDriverInfoData } from "../db/auditDriverInfo";

const ITEMS: { key: keyof AuditDriverInfoData; label: string; Icon: LucideIcon }[] = [
  { key: "address", label: "Address", Icon: MapPin },
  { key: "phone", label: "Phone", Icon: Phone },
  { key: "email", label: "Email", Icon: Mail },
];

/** The driver's Address, Phone and Email. docs/specs/accountant-audit-02-driver-select.md §3 (D7, R9) */
export function AuditDriverInfo({ info }: { info: AuditDriverInfoData }) {
  return (
    <div data-testid="audit-driver-info" className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
      {ITEMS.map(({ key, label, Icon }) => (
        <div key={key} className="flex items-start gap-2">
          <Icon aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] text-gray-500" />
          <div className="flex flex-col">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {label}
            </span>
            <span className="text-sm text-gray-900">{info[key] ?? "–"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
