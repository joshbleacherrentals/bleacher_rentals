"use client";

import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { NOTES_TEXTAREA_CLASS } from "./notesTextarea";

export function NotesSection() {
  const clientFacingNotes = useCreateQuoteStore((s) => s.clientFacingNotes);
  const internalNotes = useCreateQuoteStore((s) => s.internalNotes);
  const setField = useCreateQuoteStore((s) => s.setField);

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Notes</h2>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Client-Facing Notes</label>
        <textarea
          value={clientFacingNotes}
          onChange={(e) => setField("clientFacingNotes", e.target.value)}
          placeholder="Visible to client..."
          className={NOTES_TEXTAREA_CLASS}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Internal Notes (not visible to client)
        </label>
        <textarea
          value={internalNotes}
          onChange={(e) => setField("internalNotes", e.target.value)}
          placeholder="Internal team notes..."
          className={NOTES_TEXTAREA_CLASS}
        />
      </div>
    </section>
  );
}
