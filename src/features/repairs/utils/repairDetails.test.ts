import { describe, expect, it } from "vitest";
import {
  buildDamageReportViews,
  closeFrom,
  findService,
  openWindow,
  repairLabel,
  repairOpenLabel,
  reportsButtonLabel,
  reportsWindowTitle,
  resolveWindows,
  serviceRowLabel,
  serviceWindowTitle,
  type WindowEntry,
} from "./repairDetails";
import { repairRow, repairService as service } from "./repairRowFixture";
import type { RawReportDetailRow, RawReportPhotoRow } from "../db/serviceWindowQueries";

// docs/specs/repairs-06-expanded-row.md §2.2 to §2.4, §3 and §7, and docs/specs/repairs-07-repair-window.md
// §2.1, §2.7, §3 and §7 (the open button's name and the stack of windows).

describe("findService", () => {
  const welding = service({ id: "s1" });
  const jacks = service({ id: "s2", categoryName: "Jacks" });
  const rows = [
    repairRow({ id: "r1", services: [welding, jacks] }),
    repairRow({ id: "r2", services: [service({ id: "s3" })] }),
  ];

  it("finds the repair and the service of a reference", () => {
    const found = findService(rows, { repairId: "r1", serviceId: "s2" });
    expect(found?.repair.id).toBe("r1");
    expect(found?.service).toBe(jacks);
  });

  it("gives null for a missing repair, a missing service and no reference", () => {
    expect(findService(rows, { repairId: "nope", serviceId: "s1" })).toBeNull();
    expect(findService(rows, { repairId: "r1", serviceId: "nope" })).toBeNull();
    expect(findService(rows, { repairId: "r2", serviceId: "s1" })).toBeNull();
    expect(findService(rows, null)).toBeNull();
  });
});

describe("repairLabel", () => {
  it("names the repair by its invoice number", () => {
    expect(repairLabel(repairRow({ id: "r", invoiceNumber: "JJ-5" }))).toBe("repair JJ-5");
  });

  it("names it by its bleachers when there is no invoice number, #? for an unknown number", () => {
    const row = repairRow({
      id: "r",
      bleachers: [
        { uuid: "b1", number: 52 },
        { uuid: "b2", number: null },
      ],
    });
    expect(repairLabel(row)).toBe("repair of bleacher #52, #?");
  });

  it("is just repair when it has neither", () => {
    expect(repairLabel(repairRow({ id: "r" }))).toBe("repair");
    expect(repairLabel(repairRow({ id: "r", invoiceNumber: "   " }))).toBe("repair");
  });
});

describe("serviceRowLabel and serviceWindowTitle", () => {
  it("write the bleacher and the category", () => {
    const s = service({ id: "s" });
    expect(serviceRowLabel(s)).toBe("Open service: bleacher 26, Welding");
    expect(serviceWindowTitle(s)).toBe("Welding · Bleacher #26");
  });

  it("leave the category out when there is none", () => {
    const s = service({ id: "s", categoryName: null, damageCategoryUuid: null });
    expect(serviceRowLabel(s)).toBe("Open service: bleacher 26");
    expect(serviceWindowTitle(s)).toBe("Bleacher #26");
    expect(serviceWindowTitle(service({ id: "s", categoryName: "" }))).toBe("Bleacher #26");
  });

  it("write ? for a bleacher whose number is unknown", () => {
    const s = service({ id: "s", bleacherNumber: null });
    expect(serviceRowLabel(s)).toBe("Open service: bleacher ?, Welding");
    expect(serviceWindowTitle(s)).toBe("Welding · Bleacher #?");
    expect(serviceWindowTitle(service({ id: "s", bleacherNumber: null, categoryName: null }))).toBe(
      "Bleacher #?",
    );
  });
});

describe("reportsButtonLabel and reportsWindowTitle (D92)", () => {
  it("has no button when no report was found", () => {
    expect(reportsButtonLabel(0)).toBeNull();
  });

  it("reads View Damage Report for one and View Damage Reports (N) for several", () => {
    expect(reportsButtonLabel(1)).toBe("View Damage Report");
    expect(reportsButtonLabel(2)).toBe("View Damage Reports (2)");
    expect(reportsButtonLabel(3)).toBe("View Damage Reports (3)");
  });

  it("titles the window Damage report for one and Damage reports (N) for several", () => {
    expect(reportsWindowTitle(1)).toBe("Damage report");
    expect(reportsWindowTitle(0)).toBe("Damage report");
    expect(reportsWindowTitle(3)).toBe("Damage reports (3)");
  });
});

// ---- buildDamageReportViews ----

const TZ = "America/Toronto";

function detail(over: Partial<RawReportDetailRow> & { id: string }): RawReportDetailRow {
  return {
    bleacherNumber: 26,
    createdAt: "2026-09-17T16:00:00Z",
    resolvedAt: null,
    seatDamage: "none",
    haulDamage: "none",
    isSafeToSit: 1,
    isSafeToHaul: 1,
    note: null,
    creatorFirstName: null,
    creatorLastName: null,
    fixedByDriver: 0,
    fixedAt: null,
    fixerFirstName: null,
    fixerLastName: null,
    ...over,
  };
}

const reportedItem = (id: string, day: string) => ({ id, day, createdAt: `${day}T16:00:00Z` });
const photo = (id: string, reportId: string, path: string): RawReportPhotoRow => ({
  id,
  reportId,
  path,
});

function build(
  over: Partial<{
    reported: ReturnType<typeof reportedItem>[];
    details: RawReportDetailRow[];
    photos: RawReportPhotoRow[];
    acknowledgements: Record<string, any>;
    timezone: string;
  }> = {},
) {
  return buildDamageReportViews({
    reported: [],
    details: [],
    photos: [],
    acknowledgements: {},
    timezone: TZ,
    ...over,
  });
}

describe("buildDamageReportViews", () => {
  it("follows the order of the reported list, not of the detail rows (D92)", () => {
    const views = build({
      reported: [reportedItem("a", "2026-09-17"), reportedItem("b", "2026-09-19")],
      details: [detail({ id: "b" }), detail({ id: "a" })],
    });
    expect(views.map((v) => v.id)).toEqual(["a", "b"]);
    expect(views.map((v) => v.day)).toEqual(["2026-09-17", "2026-09-19"]);
  });

  it("leaves out a report that has no detail row", () => {
    const views = build({
      reported: [reportedItem("a", "2026-09-17"), reportedItem("gone", "2026-09-18")],
      details: [detail({ id: "a" })],
    });
    expect(views.map((v) => v.id)).toEqual(["a"]);
  });

  it("takes the damage levels from the stored levels and the old safe flags", () => {
    const [view] = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [
        detail({
          id: "a",
          seatDamage: "minor",
          haulDamage: "none",
          isSafeToSit: 1,
          isSafeToHaul: 0, // an unsafe flag with no level reads as major
        }),
      ],
    });
    expect(view.seat).toBe("minor");
    expect(view.haul).toBe("major");
    const [calm] = build({
      reported: [reportedItem("b", "2026-09-17")],
      details: [detail({ id: "b" })],
    });
    expect(calm.seat).toBe("none");
    expect(calm.haul).toBe("none");
  });

  it("writes the creator's name trimmed, and null when nobody is known", () => {
    const views = build({
      reported: [
        reportedItem("a", "2026-09-17"),
        reportedItem("b", "2026-09-17"),
        reportedItem("c", "2026-09-17"),
      ],
      details: [
        detail({ id: "a", creatorFirstName: "Jane", creatorLastName: "Doe" }),
        detail({ id: "b", creatorFirstName: " Sam ", creatorLastName: null }),
        detail({ id: "c", creatorFirstName: "", creatorLastName: "" }),
      ],
    });
    expect(views.map((v) => v.createdBy)).toEqual(["Jane Doe", "Sam", null]);
  });

  it("carries the bleacher number, the note and the photos of each report", () => {
    const views = build({
      reported: [reportedItem("a", "2026-09-17"), reportedItem("b", "2026-09-18")],
      details: [
        detail({ id: "a", bleacherNumber: 26, note: "Cracked weld" }),
        detail({ id: "b", bleacherNumber: null }),
      ],
      photos: [
        photo("p1", "a", "a/one.jpg"),
        photo("p2", "b", "b/two.jpg"),
        photo("p3", "a", "a/three.heic"),
        { id: "p4", reportId: null, path: "x.jpg" },
        { id: "p5", reportId: "a", path: null },
      ],
    });
    expect(views[0].bleacherNumber).toBe(26);
    expect(views[0].note).toBe("Cracked weld");
    expect(views[0].photos).toEqual([
      { id: "p1", path: "a/one.jpg" },
      { id: "p3", path: "a/three.heic" },
    ]);
    expect(views[1].bleacherNumber).toBeNull();
    expect(views[1].note).toBeNull();
    expect(views[1].photos).toEqual([{ id: "p2", path: "b/two.jpg" }]);
  });

  it("gives the resolve day in the given time zone (D37)", () => {
    const resolvedAt = "2026-09-20T02:30:00Z"; // 22:30 on the 19th in Toronto
    const toronto = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [detail({ id: "a", resolvedAt })],
      timezone: "America/Toronto",
    });
    const utc = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [detail({ id: "a", resolvedAt })],
      timezone: "UTC",
    });
    expect(toronto[0].resolvedDay).toBe("2026-09-19");
    expect(utc[0].resolvedDay).toBe("2026-09-20");
    const [open] = build({
      reported: [reportedItem("b", "2026-09-17")],
      details: [detail({ id: "b" })],
    });
    expect(open.resolvedDay).toBeNull();
  });

  it("turns the confirmations into names, days in the time zone and the inspection flag", () => {
    const [view] = build({
      reported: [reportedItem("a", "2026-09-17")],
      details: [detail({ id: "a" })],
      acknowledgements: {
        a: {
          count: 2,
          latestAt: "2026-09-20T02:30:00Z",
          entries: [
            { id: "k1", name: "Pat Lee", at: "2026-09-20T02:30:00Z", source: "inspection" },
            { id: "k2", name: "A driver", at: null, source: "standalone" },
          ],
        },
      },
    });
    expect(view.confirmations).toEqual([
      { id: "k1", name: "Pat Lee", day: "2026-09-19", duringInspection: true },
      { id: "k2", name: "A driver", day: null, duringInspection: false },
    ]);
    const [none] = build({
      reported: [reportedItem("b", "2026-09-17")],
      details: [detail({ id: "b" })],
    });
    expect(none.confirmations).toEqual([]);
  });

  it("writes the fixed mark with a name or as a driver, and only while not resolved", () => {
    const views = build({
      reported: [
        reportedItem("named", "2026-09-17"),
        reportedItem("unnamed", "2026-09-17"),
        reportedItem("resolved", "2026-09-17"),
        reportedItem("plain", "2026-09-17"),
      ],
      details: [
        detail({
          id: "named",
          fixedByDriver: 1,
          fixedAt: "2026-09-18T16:00:00Z",
          fixerFirstName: "Sam",
          fixerLastName: "Roe",
        }),
        detail({ id: "unnamed", fixedByDriver: 1, fixedAt: null }),
        detail({
          id: "resolved",
          fixedByDriver: 1,
          fixedAt: "2026-09-18T16:00:00Z",
          resolvedAt: "2026-09-19T16:00:00Z",
        }),
        detail({ id: "plain" }),
      ],
    });
    expect(views.map((v) => v.fixedMark)).toEqual([
      "Fixed by Sam Roe on 2026-09-18",
      "Fixed by a driver",
      null,
      null,
    ]);
  });
});

describe("repairOpenLabel (D94)", () => {
  it("names the button after the repair's invoice number", () => {
    expect(repairOpenLabel(repairRow({ id: "r", invoiceNumber: "JJ-5" }))).toBe("Open repair JJ-5");
  });

  it("names it after the bleachers when there is no invoice number, #? for an unknown number", () => {
    const row = repairRow({
      id: "r",
      bleachers: [
        { uuid: "b1", number: 52 },
        { uuid: "b2", number: null },
      ],
    });
    expect(repairOpenLabel(row)).toBe("Open repair of bleacher #52, #?");
  });

  it("is just Open repair when it has neither", () => {
    expect(repairOpenLabel(repairRow({ id: "r" }))).toBe("Open repair");
  });
});

const repairEntry = (repairId: string): WindowEntry => ({ kind: "repair", repairId });
const serviceEntry = (repairId: string, serviceId: string): WindowEntry => ({
  kind: "service",
  repairId,
  serviceId,
});
const reportsEntry = (...ids: string[]): WindowEntry => ({
  kind: "reports",
  reported: ids.map((id) => ({ id, day: "2026-09-17", createdAt: "2026-09-17T16:00:00Z" })),
});

describe("openWindow (D96)", () => {
  it("puts a window on top of the stack", () => {
    const stack = openWindow([serviceEntry("r1", "s1")], repairEntry("r1"));
    expect(stack).toEqual([serviceEntry("r1", "s1"), repairEntry("r1")]);
  });

  it("starts a stack from nothing", () => {
    expect(openWindow([], repairEntry("r1"))).toEqual([repairEntry("r1")]);
  });

  it("changes nothing when the window asked for is the one already on top", () => {
    const stack = [repairEntry("r1"), serviceEntry("r1", "s1")];
    expect(openWindow(stack, serviceEntry("r1", "s1"))).toEqual(stack);
    expect(openWindow([reportsEntry("a", "b")], reportsEntry("a", "b"))).toEqual([
      reportsEntry("a", "b"),
    ]);
    expect(openWindow([repairEntry("r1")], repairEntry("r1"))).toEqual([repairEntry("r1")]);
  });

  it("does push the same window when it is only under another one, or another of its kind", () => {
    expect(
      openWindow([repairEntry("r1"), serviceEntry("r1", "s1")], repairEntry("r1")),
    ).toHaveLength(3);
    expect(openWindow([serviceEntry("r1", "s1")], serviceEntry("r1", "s2"))).toHaveLength(2);
    expect(openWindow([reportsEntry("a")], reportsEntry("a", "b"))).toHaveLength(2);
    expect(openWindow([repairEntry("r1")], repairEntry("r2"))).toHaveLength(2);
  });

  it("does not change the stack it is given", () => {
    const stack: WindowEntry[] = [repairEntry("r1")];
    openWindow(stack, serviceEntry("r1", "s1"));
    expect(stack).toEqual([repairEntry("r1")]);
  });
});

describe("closeFrom (D96)", () => {
  const stack = [serviceEntry("r1", "s1"), repairEntry("r1"), serviceEntry("r1", "s2")];

  it("removes the window at the index and every window above it", () => {
    expect(closeFrom(stack, 2)).toEqual([serviceEntry("r1", "s1"), repairEntry("r1")]);
    expect(closeFrom(stack, 1)).toEqual([serviceEntry("r1", "s1")]);
  });

  it("empties the stack at index 0", () => {
    expect(closeFrom(stack, 0)).toEqual([]);
  });

  it("changes nothing for an index past the end", () => {
    expect(closeFrom(stack, 3)).toEqual(stack);
    expect(closeFrom(stack, 10)).toEqual(stack);
  });

  it("does not change the stack it is given", () => {
    const copy = [...stack];
    closeFrom(stack, 0);
    expect(stack).toEqual(copy);
  });
});

describe("resolveWindows (D96, D98)", () => {
  const rows = [
    repairRow({ id: "r1", services: [service({ id: "s1" }), service({ id: "s2" })] }),
    repairRow({ id: "r2", services: [service({ id: "s3" })] }),
  ];

  it("resolves a repair, a service and a reports entry in order, each with its index", () => {
    const reports = reportsEntry("a");
    const windows = resolveWindows(rows, [serviceEntry("r2", "s3"), repairEntry("r1"), reports]);
    expect(windows.map((w) => [w.kind, w.index])).toEqual([
      ["service", 0],
      ["repair", 1],
      ["reports", 2],
    ]);
    const [svc, rep, rpt] = windows;
    expect(svc.kind === "service" && svc.repair.id).toBe("r2");
    expect(svc.kind === "service" && svc.service.id).toBe("s3");
    expect(rep.kind === "repair" && rep.repair.id).toBe("r1");
    expect(rpt.kind === "reports" && rpt.reported).toBe(
      reports.kind === "reports" && reports.reported,
    );
  });

  it("gives nothing for an empty stack", () => {
    expect(resolveWindows(rows, [])).toEqual([]);
  });

  it("leaves out a window whose repair or service is not in the rows, and keeps the others", () => {
    const windows = resolveWindows(rows, [
      repairEntry("gone"),
      serviceEntry("r1", "gone"),
      serviceEntry("gone", "s1"),
      repairEntry("r2"),
    ]);
    expect(windows.map((w) => [w.kind, w.index])).toEqual([["repair", 3]]);
  });

  it("does not draw Open repair in a service window that has a repair window of that repair below it", () => {
    const [, service] = resolveWindows(rows, [repairEntry("r1"), serviceEntry("r1", "s1")]);
    expect(service.kind === "service" && service.showOpenRepair).toBe(false);
  });

  it("draws Open repair in a service window that is the only window", () => {
    const [only] = resolveWindows(rows, [serviceEntry("r1", "s1")]);
    expect(only.kind === "service" && only.showOpenRepair).toBe(true);
  });

  it("draws Open repair when the repair window below it is another repair's", () => {
    const [, service] = resolveWindows(rows, [repairEntry("r2"), serviceEntry("r1", "s1")]);
    expect(service.kind === "service" && service.showOpenRepair).toBe(true);
  });

  it("draws Open repair in a service window that is below the repair window", () => {
    const [service] = resolveWindows(rows, [serviceEntry("r1", "s1"), repairEntry("r1")]);
    expect(service.kind === "service" && service.showOpenRepair).toBe(true);
  });

  it("decides each service window on its own in a deep stack", () => {
    const windows = resolveWindows(rows, [
      serviceEntry("r1", "s1"),
      repairEntry("r1"),
      serviceEntry("r1", "s2"),
      reportsEntry("a"),
    ]);
    const flags = windows.map((w) => (w.kind === "service" ? w.showOpenRepair : null));
    expect(flags).toEqual([true, null, false, null]);
  });

  it("finds the newest values of the rows on every call", () => {
    const stack = [repairEntry("r1")];
    const first = resolveWindows(rows, stack)[0];
    const renamed = [repairRow({ id: "r1", invoiceNumber: "NEW" }), rows[1]];
    const second = resolveWindows(renamed, stack)[0];
    expect(first.kind === "repair" && first.repair.invoiceNumber).toBeNull();
    expect(second.kind === "repair" && second.repair.invoiceNumber).toBe("NEW");
  });
});

// docs/specs/repairs-09a-repair-writes.md §2.8, §3 and §7 (D126): the stack gets a `new` entry for
// the New repair window.
describe("the new entry of the stack (spec 09a)", () => {
  const newEntry: WindowEntry = { kind: "new" };

  it("opens on an empty stack and on top of another window", () => {
    expect(openWindow([], newEntry)).toEqual([newEntry]);
    expect(openWindow([repairEntry("r1")], newEntry)).toEqual([repairEntry("r1"), newEntry]);
  });

  it("is the same as another new entry on the top: it is not opened twice", () => {
    expect(openWindow([newEntry], newEntry)).toEqual([newEntry]);
  });

  it("closes with closeFrom, with the windows above it", () => {
    expect(closeFrom([repairEntry("r1"), newEntry, reportsEntry("a")], 1)).toEqual([
      repairEntry("r1"),
    ]);
    expect(closeFrom([newEntry], 0)).toEqual([]);
  });

  it("is drawn by resolveWindows with its index and no repair behind it", () => {
    const rows = [repairRow({ id: "r1" })];
    const windows = resolveWindows(rows, [repairEntry("r1"), newEntry]);
    expect(windows.map((w) => [w.kind, w.index])).toEqual([
      ["repair", 0],
      ["new", 1],
    ]);
  });

  it("is drawn even when the rows are empty", () => {
    expect(resolveWindows([], [newEntry]).map((w) => w.kind)).toEqual(["new"]);
  });
});

// docs/specs/repairs-09b1-services.md §2.4, §3 and §7 (D158): the stack gets a `newService` entry for
// the New service window of a live repair.
describe("the newService entry of the stack (spec 09b1)", () => {
  const entry = (repairId: string): WindowEntry => ({ kind: "newService", repairId });
  const rows = [repairRow({ id: "r1" }), repairRow({ id: "r2", deleted: true })];

  it("opens on an empty stack and on top of another window", () => {
    expect(openWindow([], entry("r1"))).toEqual([entry("r1")]);
    expect(openWindow([repairEntry("r1")], entry("r1"))).toEqual([repairEntry("r1"), entry("r1")]);
  });

  it("is the same as another of the same repair on the top, and different for another repair", () => {
    expect(openWindow([entry("r1")], entry("r1"))).toEqual([entry("r1")]);
    expect(openWindow([entry("r1")], entry("r2"))).toEqual([entry("r1"), entry("r2")]);
  });

  it("is not the same as a repair window or a service window of that repair", () => {
    expect(openWindow([repairEntry("r1")], entry("r1"))).toHaveLength(2);
    expect(openWindow([serviceEntry("r1", "s1")], entry("r1"))).toHaveLength(2);
  });

  it("closes with closeFrom, with the windows above it", () => {
    expect(closeFrom([repairEntry("r1"), entry("r1"), reportsEntry("a")], 1)).toEqual([
      repairEntry("r1"),
    ]);
  });

  it("is drawn by resolveWindows with its index and its repair", () => {
    const windows = resolveWindows(rows, [repairEntry("r1"), entry("r1")]);
    expect(windows.map((w) => [w.kind, w.index])).toEqual([
      ["repair", 0],
      ["newService", 1],
    ]);
    const added = windows[1];
    expect(added.kind === "newService" && added.repair.id).toBe("r1");
  });

  it("is left out when its repair is not in the rows or is deleted", () => {
    expect(resolveWindows(rows, [entry("nope")])).toEqual([]);
    expect(resolveWindows(rows, [entry("r2")])).toEqual([]);
    expect(resolveWindows(rows, [entry("r2"), repairEntry("r1")]).map((w) => w.kind)).toEqual([
      "repair",
    ]);
  });
});
