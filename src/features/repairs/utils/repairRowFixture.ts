import type { RepairListRow } from "./repairRows";

/**
 * A repair row with every field empty, for the tests of the Repairs page. Pass only what the case
 * is about. docs/specs/repairs-04-table.md §7.
 */
export function repairRow(over: Partial<RepairListRow> & { id: string }): RepairListRow {
  return {
    eventName: null,
    eventStart: null,
    eventEnd: null,
    notes: null,
    createdAt: null,
    deleted: false,
    status: "inbound",
    currency: "USD",
    invoiceNumber: null,
    vendorUuid: null,
    vendorName: null,
    completedOn: null,
    zones: [],
    bleachers: [],
    severities: [],
    categories: [],
    services: [],
    laborCents: null,
    partsCents: null,
    taxCents: null,
    freightCents: null,
    totalCents: null,
    reported: [],
    ...over,
  };
}
