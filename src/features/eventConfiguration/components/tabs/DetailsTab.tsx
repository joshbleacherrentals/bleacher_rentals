import React from "react";
import { CheckCircle, TriangleAlert } from "lucide-react";
import { Dropdown } from "@/components/DropDown";
import { Textarea } from "@/components/TextArea";
import { useCurrentEventStore } from "../../state/useCurrentEventStore";
import { EventStatus } from "@/features/dashboard/types";
import { useBleacherTypesActive } from "@/features/pricingMatrix/hooks/useBleacherTypesActive";
import { useBleacherMismatch } from "../../hooks/useBleacherMismatch";
import { LostReasonFields } from "@/features/quotesAndBookings/components/lostReason/LostReasonFields";

export const DetailsTab = () => {
  const setField = useCurrentEventStore((s) => s.setField);
  const selectedStatus = useCurrentEventStore((s) => s.selectedStatus);
  const lostReason = useCurrentEventStore((s) => s.lostReason);
  const lostReasonNote = useCurrentEventStore((s) => s.lostReasonNote);
  const notes = useCurrentEventStore((s) => s.notes);
  const bookedAt = useCurrentEventStore((s) => s.bookedAt);
  const createdAt = useCurrentEventStore((s) => s.createdAt);
  const bleacherRequirements = useCurrentEventStore((s) => s.bleacherRequirements);
  const { bleacherTypes } = useBleacherTypesActive();
  const { assignedCountByType } = useBleacherMismatch();

  React.useEffect(() => {
    if (selectedStatus === "booked") {
      const currentBookedAt = useCurrentEventStore.getState().bookedAt;
      if (!currentBookedAt) {
        setField("bookedAt", new Date().toISOString().split("T")[0] + "T12:00:00Z");
      }
    } else {
      setField("bookedAt", null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStatus]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        {/* Read-only bleacher requirements from line items */}
        <div className="mb-3">
          <label className="block text-sm font-medium text-black/70 mb-1">
            Bleacher Requirements
          </label>
          {bleacherRequirements.length === 0 ? (
            <p className="text-sm text-black/40">No bleacher requirements set.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {bleacherRequirements.map((req) => {
                const bt = bleacherTypes.find((t) => t.id === req.bleacherTypeUuid);
                const name =
                  bt?.name ?? (bt?.row_count ? `${bt.row_count}-Row` : req.bleacherTypeUuid);
                const assigned = assignedCountByType[req.bleacherTypeUuid] ?? 0;
                const met = assigned === req.quantity;
                return (
                  <li
                    key={req.bleacherTypeUuid}
                    className="flex items-center justify-between text-sm rounded border border-gray-200 bg-gray-50 px-3 py-1.5"
                  >
                    <span className="font-medium text-gray-700">{name}</span>
                    <span className="flex items-center gap-1.5 tabular-nums text-sm font-medium">
                      <span className={met ? "text-green-700" : "text-red-600"}>
                        {assigned} / {req.quantity}
                      </span>
                      {met ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <TriangleAlert className="w-4 h-4 text-red-500" />
                      )}
                    </span>
                  </li>
                );
              })}
              {Object.entries(assignedCountByType)
                .filter(
                  ([typeUuid]) =>
                    !bleacherRequirements.some((r) => r.bleacherTypeUuid === typeUuid),
                )
                .map(([typeUuid, count]) => {
                  const bt = bleacherTypes.find((t) => t.id === typeUuid);
                  const name = bt?.name ?? (bt?.row_count ? `${bt.row_count}-Row` : typeUuid);
                  return (
                    <li
                      key={typeUuid}
                      className="flex items-center justify-between text-sm rounded border border-amber-200 bg-amber-50 px-3 py-1.5"
                    >
                      <span className="font-medium text-gray-700">{name}</span>
                      <span className="flex items-center gap-1.5 tabular-nums text-sm font-medium">
                        <span className="text-amber-600">{count} / 0</span>
                        <TriangleAlert className="w-4 h-4 text-amber-500" />
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>

        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-black/70">Status</label>
            <Dropdown
              options={[
                { label: "Quoted", value: "quoted" },
                { label: "Booked", value: "booked" },
                { label: "Lost", value: "lost" },
              ]}
              selected={selectedStatus}
              onSelect={(e) => setField("selectedStatus", e as EventStatus)}
              placeholder="Pick status"
            />
          </div>
          {selectedStatus === "lost" && (
            <div className="flex-1 min-w-0">
              <LostReasonFields
                reason={lostReason}
                note={lostReasonNote}
                onReasonChange={(val) => setField("lostReason", val)}
                onNoteChange={(val) => setField("lostReasonNote", val)}
                labelClassName="block text-sm font-medium text-black/70"
              />
            </div>
          )}
          {selectedStatus === "booked" && (
            <div className="flex-1 min-w-0">
              <label className="block text-sm font-medium text-black/70">Booked At</label>
              <input
                type="date"
                className="w-full h-[40px] px-3 py-2 border bg-white rounded text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                value={bookedAt?.split("T")[0] ?? ""}
                onChange={(e) =>
                  setField("bookedAt", e.target.value ? e.target.value + "T12:00:00Z" : null)
                }
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-black/70">Created At</label>
            <input
              type="datetime-local"
              className="w-full h-[40px] px-3 py-2 border bg-white rounded text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
              value={createdAt ? createdAt.slice(0, 16) : ""}
              onChange={(e) =>
                setField("createdAt", e.target.value ? e.target.value + ":00Z" : null)
              }
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-black/70 mb-1">Notes</label>
        <Textarea
          className="bg-white"
          placeholder="Type your message here."
          value={notes}
          onChange={(e) => setField("notes", e.target.value)}
        />
      </div>
    </div>
  );
};
