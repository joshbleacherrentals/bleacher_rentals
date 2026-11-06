import type { ScheduleRow } from "../utils/invoiceView";

/**
 * The Payment Schedule section: the installments and how far each one is paid.
 * docs/specs/accountant-collections-09-design.md §3.
 */

// The Billing tab's colours for the same three states.
const CHIP: Record<ScheduleRow["status"], string> = {
  Paid: "bg-green-100 text-green-800",
  Partial: "bg-amber-100 text-amber-800",
  Unpaid: "bg-yellow-100 text-yellow-800",
};

const TH = "border-b border-gray-200 p-2 font-medium";

export function PaymentScheduleTable({ schedule }: { schedule: readonly ScheduleRow[] }) {
  return (
    <section
      aria-label="Payment Schedule"
      className="rounded-[10px] border border-gray-200 bg-white p-5"
    >
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Payment Schedule
      </h3>
      {schedule.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">No payment schedule set.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
                <th scope="col" className={`${TH} w-10 pl-0`}>
                  #
                </th>
                <th scope="col" className={TH}>
                  Due Date
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  Amount
                </th>
                <th scope="col" className={`${TH} text-center`}>
                  Status
                </th>
                <th scope="col" className={`${TH} pr-0`}>
                  Paid at
                </th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={row.number} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-3 pr-2 text-gray-500">{row.number}</td>
                  <td className="p-3">{row.dueDate}</td>
                  <td className="p-3 text-right font-medium tabular-nums">{row.amount}</td>
                  <td className="p-3 text-center">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${CHIP[row.status]}`}
                    >
                      {row.status}
                    </span>
                    {row.partialText && (
                      <div className="mt-0.5 text-xs text-gray-500">{row.partialText}</div>
                    )}
                  </td>
                  <td className={`py-3 pl-2 ${row.paidAt ? "" : "text-gray-500"}`}>
                    {row.paidAt ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
