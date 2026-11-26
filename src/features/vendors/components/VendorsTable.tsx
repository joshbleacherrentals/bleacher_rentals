"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type {
  VendorAddress,
  VendorRecord,
  VendorStatus,
} from "@/features/manageTeam/utils/vendorForm";
import type { VendorSort, VendorSortKey } from "../utils/vendorListRows";
import { VENDOR_SERVICES, VENDOR_STATUS_LABELS, VENDOR_TYPE_LABELS } from "../utils/vendorLabels";

/** An empty cell (D18). */
const DASH = "—";

/** "City, State, Country" from the address (D18); empty when the vendor has none. */
export function locationLine(address: VendorAddress | null): string {
  if (!address) return "";
  return [address.city, address.stateProvince, address.country].filter(Boolean).join(", ");
}

const STATUS_CLASSES: Record<VendorStatus, string> = {
  verified: "border-green-200 bg-green-50 text-green-800",
  caution: "border-amber-200 bg-amber-50 text-amber-800",
  under_review: "border-blue-200 bg-blue-50 text-blue-800",
  prospect: "border-gray-200 bg-gray-100 text-gray-700",
  do_not_use: "border-red-200 bg-red-50 text-red-800",
};

const CHIP = "inline-block rounded-full border px-2 py-px text-xs leading-[18px] whitespace-nowrap";

type SortableHeaderProps = {
  label: string;
  sortKey: VendorSortKey;
  sort: VendorSort;
  onSort: (key: VendorSortKey) => void;
};

/** A header that sorts: a button with an arrow on the sorted column (D19). */
function SortableHeader({ label, sortKey, sort, onSort }: SortableHeaderProps) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className="px-3 py-2 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase"
    >
      <button
        type="button"
        data-testid={`sort-${sortKey}`}
        onClick={() => onSort(sortKey)}
        className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-gray-900"
      >
        {label}
        {active &&
          (sort.direction === "asc" ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          ))}
      </button>
    </th>
  );
}

const PLAIN_HEADER =
  "px-3 py-2 text-left text-xs font-semibold tracking-wide text-gray-600 uppercase";

export type VendorsTableProps = {
  rows: readonly VendorRecord[];
  sort: VendorSort;
  onSort: (key: VendorSortKey) => void;
  onOpen: (vendor: VendorRecord) => void;
};

/**
 * The list of vendors: six columns, only Vendor and Type sort (docs/specs/vendors-page.md D18,
 * D19). A row is a button that opens the vendor window; an empty cell shows a dash.
 */
export function VendorsTable({ rows, sort, onSort, onOpen }: VendorsTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
      <table data-testid="vendors-table" className="w-full min-w-[860px] border-collapse text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <SortableHeader label="Vendor" sortKey="vendor" sort={sort} onSort={onSort} />
            <SortableHeader label="Type" sortKey="type" sort={sort} onSort={onSort} />
            <th scope="col" className={PLAIN_HEADER}>
              Status
            </th>
            <th scope="col" className={PLAIN_HEADER}>
              Services
            </th>
            <th scope="col" className={PLAIN_HEADER}>
              Contact
            </th>
            <th scope="col" className={PLAIN_HEADER}>
              Location
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                data-testid="vendors-empty"
                className="px-3 py-10 text-center text-sm text-gray-500"
              >
                No vendors found
              </td>
            </tr>
          ) : (
            rows.map((vendor) => <VendorRow key={vendor.id} vendor={vendor} onOpen={onOpen} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

function VendorRow({
  vendor,
  onOpen,
}: {
  vendor: VendorRecord;
  onOpen: (v: VendorRecord) => void;
}) {
  const services = VENDOR_SERVICES.filter((s) => vendor[s.key]);
  const location = locationLine(vendor.address);
  const contact = [vendor.contactName, vendor.phone, vendor.contactEmail].filter(
    (t): t is string => !!t,
  );
  return (
    <tr
      data-testid="vendor-row"
      data-vendor-id={vendor.id}
      tabIndex={0}
      onClick={() => onOpen(vendor)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(vendor);
        }
      }}
      className="cursor-pointer border-b border-gray-100 align-top last:border-b-0 hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none"
    >
      <td data-col="vendor" className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          {vendor.logoUrl ? (
            <img
              src={vendor.logoUrl}
              alt=""
              className="size-8 flex-shrink-0 rounded-full bg-gray-200 object-cover"
            />
          ) : (
            <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-greenAccent/20 text-sm font-bold text-greenAccent">
              {vendor.displayName.charAt(0).toUpperCase() || "?"}
            </div>
          )}
          <span className="min-w-0 font-semibold break-words text-gray-900">
            {vendor.displayName}
          </span>
        </div>
      </td>
      <td data-col="type" className="px-3 py-2.5">
        <span className={`${CHIP} border-gray-300 bg-white text-gray-700`}>
          {VENDOR_TYPE_LABELS[vendor.type]}
        </span>
      </td>
      <td data-col="status" className="px-3 py-2.5">
        {vendor.status ? (
          <span className={`${CHIP} ${STATUS_CLASSES[vendor.status]}`}>
            {VENDOR_STATUS_LABELS[vendor.status]}
          </span>
        ) : (
          <span className="text-gray-400">{DASH}</span>
        )}
      </td>
      <td data-col="services" className="px-3 py-2.5">
        {services.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {services.map((s) => (
              <span key={s.key} className={`${CHIP} border-gray-300 bg-gray-50 text-gray-700`}>
                {s.label}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">{DASH}</span>
        )}
      </td>
      <td data-col="contact" className="px-3 py-2.5 text-gray-700">
        {contact.length > 0 ? (
          <div className="flex flex-col">
            {contact.map((line) => (
              <span key={line} className="break-words">
                {line}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-gray-400">{DASH}</span>
        )}
      </td>
      <td data-col="location" className="px-3 py-2.5 text-gray-700">
        {location ? location : <span className="text-gray-400">{DASH}</span>}
      </td>
    </tr>
  );
}
