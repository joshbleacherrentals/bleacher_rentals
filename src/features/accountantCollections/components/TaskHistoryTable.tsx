"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { deleteClosedTask } from "../db/deleteTask";
import { buildTaskHistory, type TaskView } from "../utils/invoiceView";
import { DeleteTaskDialog, runTaskDelete } from "./DeleteTaskDialog";

/**
 * The Task History section of Information: every task of the event, the completed ones oldest
 * first and the open one last, marked Open. docs/specs/accountant-collections-13-task-history-and-files.md §3.
 *
 * A closed row has a trash button in the last column; it opens the "Are you sure?" window, and Yes
 * deletes the task (hides it: a soft delete). The open row has no button.
 * docs/specs/accountant-collections-19-task-delete.md §3.
 */

const TH = "border-b border-gray-200 p-2 font-medium";
// The look of the Files table's icon buttons, in the red of its Delete.
const DELETE_BUTTON =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-[#a8403a] hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40";

export function TaskHistoryTable({
  tasks,
}: {
  tasks: { open: TaskView | null; completed: readonly TaskView[] };
}) {
  const rows = buildTaskHistory(tasks);
  // The row the window is about: its id for the delete, its number for the words.
  const [target, setTarget] = useState<{ id: string; number: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await runTaskDelete({
        taskId: target.id,
        now: new Date().toISOString(),
        deleteTask: deleteClosedTask,
        close: () => setTarget(null),
        showError: createErrorToastNoThrow,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Task History"
      className="rounded-[10px] border border-gray-200 bg-white p-5"
    >
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
        Task History
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
              <th scope="col" className={`${TH} w-10 pl-0`}>
                #
              </th>
              <th scope="col" className={`${TH} w-[132px]`}>
                Finished at
              </th>
              <th scope="col" className={`${TH} w-[132px]`}>
                Due Date
              </th>
              <th scope="col" className={TH}>
                Note
              </th>
              <th scope="col" className={`${TH} w-12 pr-0`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  No tasks yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                  <td className="py-3 pr-2 align-top text-gray-500">{row.number}</td>
                  <td
                    className={`p-3 align-top ${row.finishedLabel === "—" ? "text-gray-500" : ""}`}
                  >
                    {row.finishedLabel}
                  </td>
                  <td className="p-3 align-top">{row.dateLabel}</td>
                  <td className="py-3 pl-2">
                    {row.note}
                    {row.isOpen && (
                      <span className="ml-2 rounded bg-blue-50 px-1.5 py-px text-xs font-medium text-lightBlue">
                        Open
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pl-2 text-right align-top">
                    {row.canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete task ${row.number}`}
                        title="Delete task"
                        onClick={() => setTarget({ id: row.id, number: row.number })}
                        className={DELETE_BUTTON}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DeleteTaskDialog
        number={target?.number ?? null}
        busy={busy}
        onConfirm={confirmDelete}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}
