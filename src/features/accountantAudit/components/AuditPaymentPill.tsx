import { Circle, CircleCheck } from "lucide-react";
import type { AuditPayment } from "../utils/auditRows";

/**
 * The Payment status cell of the Audit table: Paid, Not paid, or a dash when the tracker has no
 * week group (D2). The word is always printed, so colour is not the only signal (R7).
 * docs/specs/accountant-audit-04-table.md §3
 */
export function AuditPaymentPill({ payment }: { payment: AuditPayment }) {
  if (payment === "none") {
    return (
      <span data-testid="audit-payment" data-payment="none" className="text-sm text-gray-400">
        –
      </span>
    );
  }

  const paid = payment === "paid";
  const Icon = paid ? CircleCheck : Circle;
  return (
    <span
      data-testid="audit-payment"
      data-payment={payment}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${
        paid ? "bg-[#dcede2] text-[#2f6b4c]" : "bg-[#fbf0da] text-[#8a6320]"
      }`}
    >
      <Icon aria-hidden="true" width={14} height={14} />
      {paid ? "Paid" : "Not paid"}
    </span>
  );
}
