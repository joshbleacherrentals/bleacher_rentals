import { db } from "@/components/providers/SystemProvider";
import { typedWriteTransaction } from "@/lib/powersync/typedQuery";
import { validateNextTask } from "../utils/validateNextTask";

/**
 * Done / Next Task: the event's open task is completed and a new open task is created, as one
 * local transaction.
 *
 * PowerSync uploads the two changes in order, the `PATCH` first and then the `PUT`, so the
 * partial unique index (one open task per event) never sees two open tasks from one device. If
 * the daily job slips in between, the `PUT` is refused (23505) and discarded with a toast; the
 * upload's verdict never reaches this function.
 *
 * Not idempotent: a second call completes the task the first one made and adds another. The
 * modal disables Save while the call runs.
 *
 * See docs/specs/accountant-collections-06-done-next-task.md.
 */

export type SaveNextTaskInput = {
  eventUuid: string;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  note: string;
  /** `YYYY-MM-DD`, the date in the timezone store (`useToday`). */
  today: string;
};

export class NextTaskValidationError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
    this.name = "NextTaskValidationError";
  }
}

export async function saveNextTask(input: SaveNextTaskInput): Promise<{ taskId: string }> {
  const checked = validateNextTask(input);
  if (!checked.ok) throw new NextTaskValidationError(checked.errors);

  const taskId = crypto.randomUUID();

  const completeOpenTasks = db
    .updateTable("ArEventTasks")
    .set({ completed: 1 })
    .where("event_uuid", "=", input.eventUuid)
    .where("completed", "=", 0)
    .compile();

  const insertNextTask = db
    .insertInto("ArEventTasks")
    .values({
      id: taskId,
      // Explicit: the server default does not apply to an upsert that carries the column.
      created_at: new Date().toISOString(),
      due_date: input.dueDate,
      completed: 0,
      note: input.note.trim(),
      event_uuid: input.eventUuid,
    })
    .compile();

  await typedWriteTransaction(async (tx) => {
    await tx.execute(completeOpenTasks.sql, completeOpenTasks.parameters as any[]);
    await tx.execute(insertNextTask.sql, insertNextTask.parameters as any[]);
  });

  return { taskId };
}
