"use client";

import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { expect, typedExecuteBatch, typedGetAll, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { discardRunsStatement, feedbackStatement, openRunsQuery } from "../db/runFeedback";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { autoWorkTrackerKey, countModelTrackers } from "../utils/autoWorkTrackerKey";
import { deleteModelDraftsStatements, weekTrackersQuery } from "../db/modelTrackers";

/**
 * Under the Create button: how many of the week's work trackers the model made (for this zone and
 * week, not edited since) and how many were made by hand, and, for admins, a button that deletes the
 * model's drafts so a run can be tried and undone.
 */
export function ModelTrackersPanel({ zoneId, weekStart }: { zoneId: string; weekStart: string }) {
  const access = useUserAccess();
  const isAdmin = access.status === "active" && access.roles.includes("admin");
  const key = autoWorkTrackerKey(zoneId, weekStart);
  const compiled = useMemo(
    () => weekTrackersQuery(zoneId, weekStart, key),
    [zoneId, weekStart, key],
  );
  const { data } = useTypedQuery(
    compiled,
    expect<{
      id: string;
      auto_work_tracker_id: string | null;
      status: string | null;
      created_at: string | null;
    }>(),
  );
  const counts = countModelTrackers(data ?? [], key);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");
  const { data: me } = useCurrentUser();
  const myUuid = me?.[0]?.id ?? null;

  if (!zoneId) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const n = counts.modelDrafts;
      // The run is thrown away too: marked discarded (left out of the analysis of dispatch's edits),
      // with the reason, when one was given.
      const now = new Date().toISOString();
      const runs = await typedGetAll(openRunsQuery(key), expect<{ id: string }>());
      const feedback = runs.flatMap((r) => {
        const stmt = feedbackStatement({
          kind: "discard",
          reason,
          runUuid: r.id,
          userUuid: myUuid,
          now,
        });
        return stmt ? [stmt] : [];
      });
      await typedExecuteBatch([
        ...deleteModelDraftsStatements(key),
        discardRunsStatement(key, myUuid, now),
        ...feedback,
      ]);
      setReason("");
      createSuccessToast([
        `Deleted ${n} draft work tracker${n === 1 ? "" : "s"} made by the model`,
      ]);
    } catch (e) {
      createErrorToastNoThrow([
        "Could not delete the model's work trackers",
        e instanceof Error ? e.message : String(e),
      ]);
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  const kept = counts.model - counts.modelDrafts;
  return (
    <div className="flex flex-col gap-1.5 text-xs text-gray-600" data-testid="model-trackers-panel">
      <p data-testid="model-trackers-counts">
        This week: <span className="font-semibold">{counts.model}</span> made by the model ·{" "}
        <span className="font-semibold">{counts.manual}</span> made or edited by hand
      </p>
      {isAdmin && counts.model > 0 && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={counts.modelDrafts === 0 || deleting}
            className="w-full text-red-700 hover:text-red-800"
            data-testid="delete-model-trackers"
          >
            {deleting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Delete model drafts ({counts.modelDrafts})
          </Button>
          {kept > 0 && (
            <p className="text-gray-500">
              {kept} released by the model {kept === 1 ? "is" : "are"} not deleted.
            </p>
          )}
        </>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {counts.modelDrafts} draft work trackers?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the drafts the model made for this zone and week, with their line items.
              Work trackers made by hand, released, or edited and saved since are kept. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">
              Why are you deleting them?{" "}
              <span className="font-normal text-gray-500">(optional)</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Trying Employees first, too many contractor trips"
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              data-testid="discard-reason"
            />
            <span className="text-xs text-gray-500">
              Helps us make the model better. The run is kept in the log as discarded.
            </span>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
