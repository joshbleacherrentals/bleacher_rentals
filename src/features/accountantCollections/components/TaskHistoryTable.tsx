import { buildTaskHistory, type TaskView } from "../utils/invoiceView";

/**
 * The Task History section of Information: every task of the event, the completed ones oldest
 * first and the open one last, marked Open. docs/specs/accountant-collections-13-task-history-and-files.md §3.
 */

const TH = "border-b border-gray-200 p-2 font-medium";

export function TaskHistoryTable({
  tasks,
}: {
  tasks: { open: TaskView | null; completed: readonly TaskView[] };
}) {
  const rows = buildTaskHistory(tasks);

  return (
    <section
      aria-label="Task History"
      className="rounded-[10px] border border-gray-200 bg-white p-5"
    >
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Task History
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
              <th scope="col" className={`${TH} w-10 pl-0`}>
                #
              </th>
              <th scope="col" className={`${TH} w-[140px]`}>
                Date
              </th>
              <th scope="col" className={`${TH} pr-0`}>
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-center text-gray-400">
                  No tasks yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-3 pr-2 align-top text-gray-500">{row.number}</td>
                  <td className="p-3 align-top">{row.dateLabel}</td>
                  <td className="py-3 pl-2">
                    {row.note}
                    {row.isOpen && (
                      <span className="ml-2 rounded bg-blue-50 px-1.5 py-px text-xs font-medium text-lightBlue">
                        Open
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
