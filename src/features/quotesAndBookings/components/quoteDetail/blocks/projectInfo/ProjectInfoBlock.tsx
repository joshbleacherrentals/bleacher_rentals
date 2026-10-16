"use client";

import { useMemo } from "react";
import type { QuoteDetail } from "../../../../db/fetchQuoteDetail";
import { logEventChanges } from "../../../../db/logEventChanges";
import {
  postFinanceBookedNotice,
  shouldNotifyFinanceBooked,
} from "../../../../utils/notifyFinanceBooked";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { triage } from "@/features/alerts/triage";
import { EditableBlock } from "../EditableBlock";
import type { SavedChange } from "../saveBlockChanges";
import { ProjectInfoEditor } from "./ProjectInfoEditor";
import { ProjectInfoView } from "./ProjectInfoView";
import {
  projectInfoColumns,
  projectInfoFromQuote,
  validateProjectInfo,
  type ProjectInfoValue,
} from "./projectInfoValue";

export function ProjectInfoBlock({ quote, canEdit }: { quote: QuoteDetail; canEdit: boolean }) {
  const supabase = useClerkSupabaseClient();
  const userId = usePermissionsStore((s) => s.userId);
  const value = useMemo(() => projectInfoFromQuote(quote), [quote]);

  // What the edit page's Save did besides the write: the change log, the alerts, and telling
  // finance when this save is what books the quote.
  const afterSave = async (changes: SavedChange[]) => {
    const event = changes.find((c) => c.table === "Events");
    if (!event) return;
    await logEventChanges(supabase, quote.id, userId, event.before, event.after);
    void triage("Events", { id: quote.id }, supabase);
    if (
      shouldNotifyFinanceBooked(
        event.before.event_status as string,
        event.after.event_status as string,
      )
    ) {
      postFinanceBookedNotice(quote.id);
    }
  };

  return (
    <EditableBlock<ProjectInfoValue>
      title="Project Info"
      value={value}
      canEdit={canEdit}
      writes={[{ table: "Events", id: quote.id, columns: projectInfoColumns }]}
      validate={validateProjectInfo}
      afterSave={afterSave}
      renderView={() => <ProjectInfoView quote={quote} />}
      renderEditor={(draft, setDraft) => (
        <ProjectInfoEditor draft={draft} onChange={setDraft} eventStart={quote.eventStart} />
      )}
    />
  );
}
