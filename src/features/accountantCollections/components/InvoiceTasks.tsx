"use client";

import { useState } from "react";
import type { TaskView } from "../utils/invoiceView";
import { DoneNextTaskDialog } from "./DoneNextTaskDialog";

/**
 * The Tasks tab: the completed tasks, the current task and Done / Next Task.
 * docs/specs/accountant-collections-09-design.md §3.
 */

const SECTION_TITLE = "text-xs font-bold uppercase tracking-wider";

export function InvoiceTasks({
  eventId,
  tasks,
  today,
}: {
  eventId: string;
  tasks: { open: TaskView | null; completed: readonly TaskView[] };
  /** `YYYY-MM-DD`, the date in the timezone store. */
  today: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div role="tabpanel" aria-label="Tasks" className="flex flex-col gap-5">
      <section
        aria-label="Task list"
        className="rounded-[10px] border border-gray-200 bg-white p-5"
      >
        <h3 className={`${SECTION_TITLE} mb-3 text-gray-500`}>Task list</h3>
        {tasks.completed.length === 0 ? (
          <p className="text-sm text-gray-500">No completed tasks yet.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {tasks.completed.map((task) => (
              <li
                key={task.id}
                className="flex flex-col gap-0.5 rounded-lg border border-gray-200 px-4 py-3"
              >
                <span className="text-xs text-gray-500">{task.followUpLabel}</span>
                <span className="text-sm">{task.note}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section
        aria-label="Current task due now"
        className="flex flex-col gap-4 rounded-[10px] border border-lightBlue/60 bg-blue-50/60 p-5"
      >
        <h3 className={`${SECTION_TITLE} text-lightBlue`}>Current task due now</h3>
        {tasks.open ? (
          <>
            <p className="m-0 text-base">{tasks.open.note}</p>
            <div>
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="h-10 rounded-md bg-darkBlue px-4 text-sm font-semibold text-white hover:bg-darkBlue/90"
              >
                Done / Next Task
              </button>
            </div>
          </>
        ) : (
          <p className="m-0 text-base text-gray-600">No open task</p>
        )}
      </section>

      <DoneNextTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        eventId={eventId}
        today={today}
      />
    </div>
  );
}
