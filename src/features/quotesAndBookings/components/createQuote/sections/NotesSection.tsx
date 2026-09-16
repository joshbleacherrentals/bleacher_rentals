"use client";

import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";

export function NotesSection() {
  const clientFacingNotes = useCreateQuoteStore((s) => s.clientFacingNotes);
  const internalNotes = useCreateQuoteStore((s) => s.internalNotes);
  const dropoffInstructions = useCreateQuoteStore((s) => s.dropoffInstructions);
  const pickupInstructions = useCreateQuoteStore((s) => s.pickupInstructions);
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
          rows={3}
          className="w-full px-3 py-2 border rounded text-sm resize-none"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Internal Notes (not visible to client)
        </label>
        <textarea
          value={internalNotes}
          onChange={(e) => setField("internalNotes", e.target.value)}
          placeholder="Internal team notes..."
          rows={3}
          className="w-full px-3 py-2 border rounded text-sm resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dropoff Instructions
          </label>
          <textarea
            value={dropoffInstructions}
            onChange={(e) => setField("dropoffInstructions", e.target.value)}
            placeholder="Notes for the driver dropping bleachers off at this venue..."
            rows={3}
            className="w-full px-3 py-2 border rounded text-sm resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pickup Instructions
          </label>
          <textarea
            value={pickupInstructions}
            onChange={(e) => setField("pickupInstructions", e.target.value)}
            placeholder="Notes for the driver picking bleachers up from this venue..."
            rows={3}
            className="w-full px-3 py-2 border rounded text-sm resize-none"
          />
        </div>
      </div>
    </section>
  );
}
