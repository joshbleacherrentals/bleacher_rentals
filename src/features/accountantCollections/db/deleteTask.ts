import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/**
 * Delete a closed task from Task History. The delete is soft (D1): the row stays in the table and
 * `deleted_at` marks it, so Task History hides it. It is an UPDATE, which the existing update
 * policy lets admin and accountant make; the table has no DELETE policy and a local DELETE would
 * not reach the server.
 *
 * Two guards keep a stale click harmless: `completed = 1`, so an open task is never hidden (the
 * database refuses it too), and `deleted_at IS NULL`, so a task that is already deleted keeps its
 * first moment. A click that matches no row changes nothing and is not an error.
 *
 * `now` is an ISO string made by the caller.
 * See docs/specs/accountant-collections-19-task-delete.md §3.
 */
export async function deleteClosedTask({
  taskId,
  now,
}: {
  taskId: string;
  now: string;
}): Promise<void> {
  const compiled = db
    .updateTable("ArEventTasks")
    .set({ deleted_at: now })
    .where("id", "=", taskId)
    .where("completed", "=", 1)
    .where("deleted_at", "is", null)
    .compile();

  await typedExecute(compiled);
}
