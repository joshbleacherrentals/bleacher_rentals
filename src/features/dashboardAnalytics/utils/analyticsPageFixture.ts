import {
  bleacher,
  budget,
  category,
  inputsOf,
  repair,
  service,
  vendor,
  zone,
} from "./analyticsFixture";
import type { AnalyticsBleacher, AnalyticsInputs } from "./analyticsTypes";

// Test data for the page of docs/specs/dashboard-analytics-05-page.md §6: a small fleet whose
// figures are worked out by hand in the tests. Pass `over` to replace a list.
//
// The fleet: 144 bleachers b1..b144. b1..b100 are in Zone 1, b101..b140 in Zone 2, b141 and b142 in
// Zone 3, b143 and b144 have no zone. b1..b10 are model TSP15-450 and b11..b14 are Speedy4510.
//
// Repairs (cents):
//  r1 2026-03-10 inbound,        Zone 1, Dallas Trailer Repair, bleachers b1 + b2
//       s1 b1 Tires    labor 100000 parts 50000                   -> 150000
//       s2 b2 Welding  labor 200000 parts 25000 tax 5000 fr 2500  -> 232500   (repair 382500)
//  r2 2026-05-02 triaged,        Zone 2, Kaypark,               bleacher b11
//       s3 b11 Tires   parts 80000                                -> 80000
//  r3 2026-01-15 completed,      Zone 1, Dallas Trailer Repair, bleacher b3
//       s4 b3 Welding  labor 120000 parts 10000                   -> 130000
//  r4 2026-08-01 waiting_repair, no zone, no vendor, bleacher b143, no service, cost 20000
//  r5 2025-06-06 completed,      Zone 1, Dallas Trailer Repair, bleacher b1
//       s5 b1 Tires    labor 40000                                -> 40000
//  r6 2024-02-02 completed,      no zone, no vendor,            bleacher b4
//       s6 b4 (no category) parts 10000                           -> 10000
//
// 2026: spend 612500; 140 of 144 ready (b1, b2, b11, b143 are in an open repair).
// Budgets: 2026 is 1225000 (the spend is exactly half), 2025 is 2000000.

export function fleetBleachers(): AnalyticsBleacher[] {
  const list: AnalyticsBleacher[] = [];
  for (let i = 1; i <= 144; i += 1) {
    const zoneId = i <= 100 ? "z1" : i <= 140 ? "z2" : i <= 142 ? "z3" : null;
    const modelNumber = i <= 10 ? "TSP15-450" : i <= 14 ? "Speedy4510" : null;
    list.push(bleacher({ id: `b${i}`, zoneId, modelNumber }));
  }
  return list;
}

export function fleetInputs(over: Partial<AnalyticsInputs> = {}): AnalyticsInputs {
  return inputsOf({
    bleachers: fleetBleachers(),
    zones: [zone("z1", "Zone 1"), zone("z2", "Zone 2"), zone("z3", "Zone 3")],
    vendors: [vendor("v1", "Dallas Trailer Repair"), vendor("v2", "Kaypark")],
    categories: [category("c1", "Tires"), category("c2", "Welding"), category("c3", "Hydraulics")],
    repairs: [
      repair({
        id: "r1",
        eventStart: "2026-03-10",
        status: "inbound",
        zoneId: "z1",
        vendorId: "v1",
      }),
      repair({
        id: "r2",
        eventStart: "2026-05-02",
        status: "triaged",
        zoneId: "z2",
        vendorId: "v2",
      }),
      repair({
        id: "r3",
        eventStart: "2026-01-15",
        status: "completed",
        zoneId: "z1",
        vendorId: "v1",
      }),
      repair({ id: "r4", eventStart: "2026-08-01", status: "waiting_repair", costCents: 20000 }),
      repair({
        id: "r5",
        eventStart: "2025-06-06",
        status: "completed",
        zoneId: "z1",
        vendorId: "v1",
      }),
      repair({ id: "r6", eventStart: "2024-02-02", status: "completed" }),
    ],
    services: [
      service({
        id: "s1",
        repairId: "r1",
        bleacherId: "b1",
        categoryId: "c1",
        laborCents: 100000,
        partsCents: 50000,
      }),
      service({
        id: "s2",
        repairId: "r1",
        bleacherId: "b2",
        categoryId: "c2",
        laborCents: 200000,
        partsCents: 25000,
        taxCents: 5000,
        freightCents: 2500,
      }),
      service({ id: "s3", repairId: "r2", bleacherId: "b11", categoryId: "c1", partsCents: 80000 }),
      service({
        id: "s4",
        repairId: "r3",
        bleacherId: "b3",
        categoryId: "c2",
        laborCents: 120000,
        partsCents: 10000,
      }),
      service({ id: "s5", repairId: "r5", bleacherId: "b1", categoryId: "c1", laborCents: 40000 }),
      service({ id: "s6", repairId: "r6", bleacherId: "b4", partsCents: 10000 }),
    ],
    repairBleachers: [
      { repairId: "r1", bleacherId: "b1" },
      { repairId: "r1", bleacherId: "b2" },
      { repairId: "r2", bleacherId: "b11" },
      { repairId: "r3", bleacherId: "b3" },
      { repairId: "r4", bleacherId: "b143" },
      { repairId: "r5", bleacherId: "b1" },
      { repairId: "r6", bleacherId: "b4" },
    ],
    budgets: [budget(2026, 1225000), budget(2025, 2000000)],
    ...over,
  });
}
