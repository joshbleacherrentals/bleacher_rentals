import type { RepairListRow, RepairService } from "./repairRows";

/**
 * A service with every amount at zero, bleacher 26 and the category Welding, for the tests of the
 * services block and the service window. Pass only what the case is about.
 * docs/specs/repairs-06-expanded-row.md §7.
 */
export function repairService(over: Partial<RepairService> & { id: string }): RepairService {
  return {
    bleacherUuid: "b1",
    bleacherNumber: 26,
    damageCategoryUuid: "c1",
    categoryName: "Welding",
    severity: "minor",
    description: null,
    laborCents: 0,
    partsCents: 0,
    taxCents: 0,
    freightCents: 0,
    totalCents: 0,
    deleted: false,
    createdAt: null,
    reported: [],
    ...over,
  };
}

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
