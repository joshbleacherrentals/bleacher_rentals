import { DataTable, type Column } from "@/components/DataTable";
import WorkTrackerStatusBadge from "@/features/workTrackers/components/WorkTrackerStatusBadge";
import { formatDriveTime, formatMileage } from "@/features/workTrackers/util";
import { auditStatusLabel, formatAddressLines, splitMileage } from "../utils/auditFormat";
import type { AuditAddress, AuditTrackerRow } from "../utils/auditRows";
import { AuditPaymentPill } from "./AuditPaymentPill";
import { WorkTrackerTypeBadge } from "./WorkTrackerTypeBadge";

type Props = {
  rows: AuditTrackerRow[];
  isLoading: boolean;
  error: Error | undefined;
};

const Dash = () => <span className="text-sm text-gray-400">–</span>;

/** A location as the street and, under it, `city, state zip` in small grey text (R5). */
function Location({ address }: { address: AuditAddress | null }) {
  const lines = formatAddressLines(address);
  if (!lines) return <Dash />;
  return (
    <div className="min-w-[180px] max-w-[260px] whitespace-normal">
      {lines.street && <div className="text-sm text-gray-900">{lines.street}</div>}
      {lines.place && <div className="text-xs text-gray-500">{lines.place}</div>}
    </div>
  );
}

const COLUMNS: Column<AuditTrackerRow>[] = [
  {
    key: "status",
    header: "Status",
    render: (row) => {
      const label = auditStatusLabel(row.status);
      return (
        // inline-flex: the badge is a block-level box, which would stretch to the column width.
        <span title={label} data-testid="audit-row-status" className="inline-flex">
          <WorkTrackerStatusBadge status={row.status} showText={false} />
          <span className="sr-only">{label}</span>
        </span>
      );
    },
  },
  {
    key: "date",
    header: "Date",
    render: (row) =>
      row.date ? <span className="text-sm tabular-nums text-gray-900">{row.date}</span> : <Dash />,
  },
  {
    key: "bleacher",
    header: "Bleacher",
    render: (row) =>
      row.bleacherNumber !== null ? (
        <span className="text-sm text-gray-900">{row.bleacherNumber}</span>
      ) : (
        <Dash />
      ),
  },
  {
    key: "type",
    header: "Type",
    render: (row) => <WorkTrackerTypeBadge code={row.typeCode} name={row.typeName} />,
  },
  {
    key: "pickup",
    header: "Pickup location",
    render: (row) => <Location address={row.pickup} />,
  },
  {
    key: "dropoff",
    header: "Dropoff location",
    render: (row) => <Location address={row.dropoff} />,
  },
  {
    key: "driveTime",
    header: "Drive time",
    render: (row) => {
      const text = formatDriveTime(row.driveMinutes);
      return text ? <span className="text-sm text-gray-900">{text}</span> : <Dash />;
    },
  },
  {
    key: "distance",
    header: "Distance",
    render: (row) => {
      const text = formatMileage(row.distanceMeters);
      if (!text) return <Dash />;
      // Miles on the first line and the bracketed kilometres under them (R6, as in the design),
      // each in a block of its own so the line never breaks inside the brackets. The space between
      // the two keeps the cell's text `21.4 mi (34.4 km)`.
      const parts = splitMileage(text);
      return (
        <div className="max-w-[104px] whitespace-normal text-sm text-gray-900">
          {parts ? (
            <>
              <span className="block">{parts.miles}</span>{" "}
              <span className="block text-xs text-gray-500">{parts.km}</span>
            </>
          ) : (
            text
          )}
        </div>
      );
    },
  },
  {
    key: "payment",
    header: "Payment status",
    render: (row) => <AuditPaymentPill payment={row.payment} />,
  },
];

/**
 * The table of one driver's work trackers: nine columns, read-only (D9). A page of rows comes in;
 * paging belongs to the tab. docs/specs/accountant-audit-04-table.md §3 (R1, R3, R10)
 */
export function AuditTrackersTable({ rows, isLoading, error }: Props) {
  if (error) {
    return (
      <div role="alert" className="py-8 text-center text-sm text-red-600">
        Error loading work trackers: {error.message}
      </div>
    );
  }

  return (
    // The shared DataTable gets the drivers table's card (rounded corners, a soft shadow) and
    // headers that stay on one line; below the width of the nine columns the table scrolls.
    <div
      data-testid="audit-table"
      className="[&>div]:rounded-xl [&>div]:shadow-sm [&_th]:whitespace-nowrap"
    >
      <DataTable<AuditTrackerRow>
        columns={COLUMNS}
        data={rows}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        loadingMessage="Loading work trackers..."
        emptyMessage="This driver has no work trackers in this range"
      />
    </div>
  );
}
