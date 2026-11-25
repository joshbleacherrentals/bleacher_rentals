import { formatDateRange } from "../utils/formatDateRange";
import type { OverbookedBleacher } from "../utils/overbooked";

/** The clashes of one overbooked bleacher: the two events, their days, and the days they share. */
export function OverbookedBleacherDetails({ bleacher }: { bleacher: OverbookedBleacher }) {
  return (
    <ul className="flex flex-col gap-2 pb-4 text-sm" data-testid="overbooked-details">
      {bleacher.conflicts.map(({ first, second, overlapStart, overlapEnd }) => (
        <li key={`${first.eventId}-${second.eventId}`}>
          <span className="font-medium">{first.eventName}</span> (
          {formatDateRange(first.startDate, first.endDate)}) overlaps{" "}
          <span className="font-medium">{second.eventName}</span> (
          {formatDateRange(second.startDate, second.endDate)}) on{" "}
          <span className="text-red-700">{formatDateRange(overlapStart, overlapEnd)}</span>
        </li>
      ))}
    </ul>
  );
}
