import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Seeds the repairs the Repairs page specs look at, straight into the database with the service
 * role (the page cannot create them yet). Everything is namespaced and `cleanup` removes it all.
 * docs/specs/repairs-04-table.md §6 and docs/specs/repairs-05-toolbar.md §6 (the zones, the vendor
 * uuid and the notes, which the toolbar specs look for) and docs/specs/repairs-06-expanded-row.md
 * §6 (a model number and a type on bleacher A, a photo on the first report, and a deleted repair
 * with a service that was deleted on its own), and docs/specs/repairs-07-repair-window.md §6 (the
 * vendor's address and two files of the completed repair), and docs/specs/repairs-09b2-bleachers-zone-
 * reports.md §6 (`links`: bleachers, open damage reports, a sub-rental and three repairs for what a
 * service does to the repair around it), and docs/specs/repairs-09b3-files.md §6 (`files`: a fresh
 * bleacher with one repair for each files scenario, whose stored files have real objects in the
 * bucket, and the payloads the scenarios pick).
 *
 * It writes `MaintenanceLineItems` and `Vendors`, which reach a user's device only where the sync
 * rules of docs/specs/repairs-02-sync-rules.md are deployed.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for e2e fixture seeding",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The service-role client of the fixtures, for the scenarios that read what the page wrote. */
export function serviceRoleClient() {
  return adminClient();
}

/** The two services of the first repair, in cents. */
export const SERVICE_TIRES = { labor: 1500, parts: 11600, tax: 783, freight: 0 };
export const SERVICE_WELDING = { labor: 41500, parts: 0, tax: 0, freight: 6500 };
/** The one service of the CAD repair. */
export const SERVICE_CAD = { labor: 0, parts: 25000, tax: 3250, freight: 0 };

/** How many cheap completed repairs sit on the second bleacher (one more than a page of 25). */
export const PAGER_REPAIRS = 26;

/** The days of the damage reports linked to the repairs (Toronto and UTC agree at 16:00Z). */
export const REPORT_DAYS = { first: "2026-09-17", second: "2026-09-19", cad: "2026-09-20" };

type BleacherRef = { uuid: string; number: number };

/** The public bucket of the files of a repair (spec 07 D99, spec 09b3 D192). */
export const FILES_BUCKET = "maintenance-photos";

/** A file as `setInputFiles` takes it. */
export type FilePayload = { name: string; mimeType: string; buffer: Buffer };

/** A real 1 x 1 PNG: a few dozen bytes, an allowed type, well under 10 MB. */
export const TINY_PNG: Buffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
/** A small file the page accepts (09b3 D197). */
export const pngFile = (name = "photo.png"): FilePayload => ({
  name,
  mimeType: "image/png",
  buffer: TINY_PNG,
});
/** An allowed type that is one byte over the 10 MB limit, so the page refuses it as too large. */
export const bigPdfFile = (name = "big.pdf"): FilePayload => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
});
/** A type that is not allowed, so the page refuses it by its MIME type. */
export const zipFile = (name = "notes.zip"): FilePayload => ({
  name,
  mimeType: "application/zip",
  buffer: Buffer.from("PK\u0003\u0004e2e", "binary"),
});

/** A repair of the files fixtures: its invoice number, and its stored files in the order of Photo 1, 2. */
export type FilesRepair = {
  id: string;
  invoice: string;
  files: { id: string; path: string }[];
};

/**
 * What the 09b3 scenarios (S43 to S50) need. Each scenario has its own repair, so that the files one
 * adds or deletes do not disturb another. All sit on `bleacher` (no zone, the Open tab, found by
 * `?bleachers=`); the stored files have a real object in the bucket, so a deletion can be read back.
 * docs/specs/repairs-09b3-files.md §6.
 */
export type SeededFiles = {
  bleacher: BleacherRef;
  /** A bleacher with no repair, for the New repair of S47 (its service goes on it). */
  newRepairBleacher: BleacherRef;
  /** S43: one stored file. */
  add: FilesRepair;
  /** S44: two stored files. */
  remove: FilesRepair;
  /** S45: two stored files. */
  edit: FilesRepair;
  /** S46: one stored file. */
  cancel: FilesRepair;
  /** S48 and S50: no file. */
  none: FilesRepair;
  /** S44: Completed and deleted, with one stored file (shown by `?tab=completed&showDeleted=1`). */
  deleted: FilesRepair;
};

/**
 * What the 09b2 scenarios (S34 to S42) need. Every bleacher here is new and has its own damage
 * reports and repairs, so that a scenario that links a report does not take it from another one.
 * Null when the database has fewer than two zones (the scenarios skip themselves).
 * docs/specs/repairs-09b2-bleachers-zone-reports.md §6.
 */
export type SeededLinks = {
  /** In the zone of bleacher A, with no repair and two open reports that no repair has (S34, S42). */
  newRepairBleacher: BleacherRef & { reportIds: string[] };
  /** In no zone (S38). */
  noZoneBleacher: BleacherRef;
  /**
   * In the zone of bleacher A, with an accepted sub-rental that borrows the other zone on `day`
   * (S39). Its own zone is the zone of A, so the two agree until a day inside the sub-rental is typed.
   */
  subrentalBleacher: BleacherRef;
  subrental: { from: string; to: string; day: string };
  /**
   * An open repair with a junction row on `bleacher` and no services (S35): one open report is free,
   * the other is linked to the in-repair CAD repair.
   */
  oldRepair: {
    id: string;
    invoice: string;
    bleacher: BleacherRef;
    freeReportId: string;
    elsewhereReportId: string;
    elsewhereRepairId: string;
  };
  /**
   * An open repair made as the page makes it: a service on `from`, its junction row, its zone (the
   * zone of A), an open report of `from` linked to it, and a free open report of `to` (S36, S40, S41).
   * `to` is in the same zone as `from`; bleacher B (`otherZoneBleacher`) is in the other one.
   */
  moveRepair: {
    id: string;
    invoice: string;
    from: BleacherRef;
    to: BleacherRef;
    otherZoneBleacher: BleacherRef;
    linkedReportId: string;
    freeReportId: string;
  };
  /**
   * A Completed repair that ended on `eventEnd`, with a junction row on `bleacher` and no services
   * (S37): one open report was created before `eventEnd` and one after.
   */
  completedRepair: {
    id: string;
    invoice: string;
    bleacher: BleacherRef;
    eventEnd: string;
    beforeReportId: string;
    afterReportId: string;
  };
};

export type SeededRepairs = {
  /**
   * Holds the completed USD repair and the in-repair CAD repair. It has a model number and, when
   * the database has a bleacher type, the first type (`typeName` is null otherwise).
   */
  bleacherA: { uuid: string; number: number; modelNumber: string; typeName: string | null };
  /** Holds the 26 cheap completed repairs. */
  bleacherB: { uuid: string; number: number };
  /** Has no repair at all. */
  emptyBleacher: { uuid: string; number: number };
  vendorName: string;
  vendorUuid: string;
  /**
   * Bleacher A is in the first existing zone and bleacher B in the second one, so the Zone filter
   * has something to tell apart. Null when the database has fewer than two zones (the zone
   * scenarios skip themselves).
   */
  zones: { a: { uuid: string; name: string }; b: { uuid: string; name: string } } | null;
  /** Completed, USD, a vendor, two services, two linked reports. */
  completed: { invoice: string; totalCents: number; notes: string };
  /** In repair, CAD, no vendor, one service, one linked report. */
  cad: { totalCents: number; notes: string };
  /** Completed and deleted. */
  deleted: { invoice: string };
  /**
   * Completed and deleted, on bleacher A, with two services: a Tires one that is live and a Welding
   * one that was deleted on its own (spec 06 D89).
   */
  deletedServices: { invoice: string; liveCategory: string; removedCategory: string };
  /** The note of every seeded damage report. */
  reportNote: string;
  /** The storage path of the one photo of the first report (the picture itself does not exist). */
  photoPath: string;
  /** The vendor's address as the repair window writes it (spec 07 D100). */
  vendorAddress: string;
  /**
   * The two files of the completed repair, a `.jpg` then a `.pdf` added a minute later: the window
   * names them "Photo 1" and "PDF 1". The objects do not exist in storage; the links are tested.
   */
  repairFiles: { photoPath: string; pdfPath: string };
  /** The fixtures of spec 09b2; null when the database has fewer than two zones. */
  links: SeededLinks | null;
  /** The fixtures of spec 09b3 (the files of a repair). */
  files: SeededFiles;
  cleanup: () => Promise<void>;
};

function check<T>(value: T | null, error: { message: string } | null, what: string): T {
  if (error || value === null) throw new Error(`fixture ${what} failed: ${error?.message}`);
  return value;
}

export async function seedRepairs(): Promise<SeededRepairs> {
  const supabase = adminClient();
  const suffix = randomUUID().slice(0, 8);
  // bleacher_number is a smallint; namespaced high, clear of real fleet numbers and of the
  // damage report fixtures (30000-31999).
  const base = 32000 + Math.floor(Math.random() * 200) * 3;

  const bleacherRes = await supabase
    .from("Bleachers")
    .insert(
      [0, 1, 2].map((i) => ({ bleacher_number: base + i, bleacher_rows: 5, bleacher_seats: 50 })),
    )
    .select("id, bleacher_number");
  const bleachers = check(bleacherRes.data, bleacherRes.error, "bleachers");
  const byNumber = (n: number) => {
    const found = bleachers.find((b) => b.bleacher_number === n);
    if (!found) throw new Error(`fixture bleacher ${n} missing`);
    return { uuid: found.id as string, number: n };
  };
  const bleacherA = byNumber(base);
  const bleacherB = byNumber(base + 1);
  const emptyBleacher = byNumber(base + 2);

  // Bleacher A gets a model number and the first existing type, for the bleacher card (spec 06).
  const modelNumber = `E2E-MODEL-${suffix}`;
  const typeRes = await supabase
    .from("BleacherTypes")
    .select("id, name")
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(1);
  const type = typeRes.data?.[0] ?? null;
  const cardUpdate = await supabase
    .from("Bleachers")
    .update({ model_number: modelNumber, ...(type ? { bleacher_type_uuid: type.id } : {}) })
    .eq("id", bleacherA.uuid);
  if (cardUpdate.error)
    throw new Error(`fixture bleacher card failed: ${cardUpdate.error.message}`);

  // Two existing zones, one for each of the two bleachers that hold repairs.
  const zoneRes = await supabase
    .from("Zones")
    .select("id, display_name")
    .order("created_at", { ascending: true })
    .limit(2);
  const zoneRows = check(zoneRes.data, zoneRes.error, "zones");
  let zones: SeededRepairs["zones"] = null;
  if (zoneRows.length === 2) {
    for (const [bleacher, zone] of [
      [bleacherA, zoneRows[0]],
      [bleacherB, zoneRows[1]],
    ] as const) {
      const update = await supabase
        .from("Bleachers")
        .update({ zone_uuid: zone.id })
        .eq("id", bleacher.uuid);
      if (update.error) throw new Error(`fixture bleacher zone failed: ${update.error.message}`);
    }
    zones = {
      a: { uuid: zoneRows[0].id as string, name: zoneRows[0].display_name as string },
      b: { uuid: zoneRows[1].id as string, name: zoneRows[1].display_name as string },
    };
  }

  // The vendor has an address, so that the repair window draws the line under its name.
  const addressRes = await supabase
    .from("Addresses")
    .insert({
      street: "1 E2E Way",
      city: "E2E City",
      state_province: "TX",
      zip_postal: "75201",
      country: "US",
    })
    .select("id")
    .single();
  const addressId = check(addressRes.data, addressRes.error, "address").id as string;

  const vendorName = `E2E Vendor ${suffix}`;
  const vendorRes = await supabase
    .from("Vendors")
    .insert({ display_name: vendorName, address_uuid: addressId })
    .select("id")
    .single();
  const vendorId = check(vendorRes.data, vendorRes.error, "vendor").id as string;

  const catRes = await supabase
    .from("DamageCategories")
    .select("id, name")
    .in("name", ["Tires", "Welding"]);
  const categories = check(catRes.data, catRes.error, "categories");
  const category = (name: string) => {
    const found = categories.find((c) => c.name === name);
    if (!found) throw new Error(`fixture category ${name} missing`);
    return found.id as string;
  };

  const eventIds: string[] = [];
  /** Every damage report the fixtures insert, removed in `cleanup`. */
  const reportIds: string[] = [];
  /** The bleachers the 09b2 fixtures add; they are removed with the others. */
  const extraBleacherIds: string[] = [];
  const insertEvent = async (fields: Record<string, unknown>, bleacherUuid: string) => {
    const res = await supabase
      .from("MaintenanceEvents")
      .insert({ event_name: "Maintenance / Repair", ...fields })
      .select("id")
      .single();
    const id = check(res.data, res.error, "repair").id as string;
    eventIds.push(id);
    const junction = await supabase
      .from("BleacherMaintEvents")
      .insert({ maintenance_event_uuid: id, bleacher_uuid: bleacherUuid });
    if (junction.error) throw new Error(`fixture junction failed: ${junction.error.message}`);
    return id;
  };
  const insertService = async (
    repairId: string,
    bleacherUuid: string,
    categoryName: string,
    severity: "minor" | "major",
    amounts: { labor: number; parts: number; tax: number; freight: number },
    deleted = false,
  ) => {
    const res = await supabase.from("MaintenanceLineItems").insert({
      maintenance_event_uuid: repairId,
      bleacher_uuid: bleacherUuid,
      damage_category_uuid: category(categoryName),
      severity,
      labor_cents: amounts.labor,
      parts_cents: amounts.parts,
      tax_cents: amounts.tax,
      freight_cents: amounts.freight,
      deleted,
    });
    if (res.error) throw new Error(`fixture service failed: ${res.error.message}`);
  };
  /** The database recomputes `cost_cents` from the services; the page shows what it stored. */
  const costOf = async (repairId: string) => {
    const res = await supabase
      .from("MaintenanceEvents")
      .select("cost_cents")
      .eq("id", repairId)
      .single();
    return check(res.data, res.error, "cost").cost_cents as number;
  };

  // The completed USD repair: a vendor, an invoice number and two services.
  const invoice = `E2E-${suffix}`;
  const completedNotes = `e2e notes ${suffix}`;
  const cadNotes = `e2e cad ${suffix}`;
  const completedId = await insertEvent(
    {
      event_start: "2026-09-18",
      event_end: "2026-09-29",
      status: "completed",
      currency: "USD",
      vendor_uuid: vendorId,
      invoice_number: invoice,
      completed_at: "2026-09-29T16:00:00Z",
      notes: completedNotes,
    },
    bleacherA.uuid,
  );
  await insertService(completedId, bleacherA.uuid, "Tires", "minor", SERVICE_TIRES);
  await insertService(completedId, bleacherA.uuid, "Welding", "major", SERVICE_WELDING);

  // The in-repair CAD repair: no vendor, no invoice, one service.
  const cadId = await insertEvent(
    {
      event_start: "2026-09-21",
      event_end: "2026-10-02",
      status: "in_repair",
      currency: "CAD",
      notes: cadNotes,
    },
    bleacherA.uuid,
  );
  await insertService(cadId, bleacherA.uuid, "Tires", "minor", SERVICE_CAD);

  // A deleted completed repair.
  const deletedInvoice = `E2E-DEL-${suffix}`;
  await insertEvent(
    {
      event_start: "2026-09-01",
      event_end: "2026-09-02",
      status: "completed",
      currency: "USD",
      invoice_number: deletedInvoice,
      completed_at: "2026-09-02T16:00:00Z",
      deleted: true,
    },
    bleacherA.uuid,
  );

  // A second deleted repair, for the "Deleted" mark: one live service and one deleted on its own.
  const deletedServicesInvoice = `E2E-DELSVC-${suffix}`;
  const deletedServicesId = await insertEvent(
    {
      event_start: "2026-08-20",
      event_end: "2026-08-21",
      status: "completed",
      currency: "USD",
      invoice_number: deletedServicesInvoice,
      completed_at: "2026-08-21T16:00:00Z",
      deleted: true,
    },
    bleacherA.uuid,
  );
  await insertService(deletedServicesId, bleacherA.uuid, "Tires", "minor", SERVICE_TIRES);
  await insertService(deletedServicesId, bleacherA.uuid, "Welding", "major", SERVICE_WELDING, true);

  // 26 cheap completed repairs on the second bleacher, for the pager.
  const pagerRes = await supabase
    .from("MaintenanceEvents")
    .insert(
      Array.from({ length: PAGER_REPAIRS }, (_, i) => ({
        event_name: "Maintenance / Repair",
        event_start: "2026-08-01",
        event_end: "2026-08-02",
        status: "completed",
        currency: "USD",
        cost_cents: 1000 + i,
        completed_at: "2026-08-02T16:00:00Z",
      })),
    )
    .select("id");
  const pagerIds = check(pagerRes.data, pagerRes.error, "pager repairs").map((r) => r.id as string);
  eventIds.push(...pagerIds);
  const pagerJunction = await supabase
    .from("BleacherMaintEvents")
    .insert(pagerIds.map((id) => ({ maintenance_event_uuid: id, bleacher_uuid: bleacherB.uuid })));
  if (pagerJunction.error) {
    throw new Error(`fixture pager junction failed: ${pagerJunction.error.message}`);
  }

  // Damage reports linked to the repairs: two on the completed one, one on the CAD one.
  const reportNote = `e2e-report-${suffix}`;
  const insertReport = async (repairId: string, createdDay: string) => {
    const res = await supabase
      .from("DamageReports")
      .insert({
        bleacher_uuid: bleacherA.uuid,
        seat_damage: "minor",
        haul_damage: "none",
        is_safe_to_sit: false,
        is_safe_to_haul: true,
        note: reportNote,
        maintenance_event_uuid: repairId,
        created_at: `${createdDay}T16:00:00Z`,
        resolved_at: `${createdDay}T20:00:00Z`,
      })
      .select("id")
      .single();
    reportIds.push(check(res.data, res.error, "report").id as string);
  };
  await insertReport(completedId, REPORT_DAYS.first);
  await insertReport(completedId, REPORT_DAYS.second);
  await insertReport(cadId, REPORT_DAYS.cad);

  // One photo on the first report. Its picture is not in storage; the page links to its path.
  const photoPath = `e2e/${suffix}/photo.jpg`;
  const photoRes = await supabase
    .from("DamageReportPhotos")
    .insert({ damage_report_uuid: reportIds[0], photo_path: photoPath });
  if (photoRes.error) throw new Error(`fixture photo failed: ${photoRes.error.message}`);

  // Two files on the completed repair, a minute apart, in the order Photo 1 then PDF 1.
  const repairFiles = {
    photoPath: `${completedId}/${suffix}-a.jpg`,
    pdfPath: `${completedId}/${suffix}-b.pdf`,
  };
  const filesRes = await supabase.from("MaintenancePhotos").insert([
    {
      maintenance_event_uuid: completedId,
      photo_path: repairFiles.photoPath,
      created_at: "2026-09-18T16:00:00Z",
    },
    {
      maintenance_event_uuid: completedId,
      photo_path: repairFiles.pdfPath,
      created_at: "2026-09-18T16:01:00Z",
    },
  ]);
  if (filesRes.error) throw new Error(`fixture files failed: ${filesRes.error.message}`);

  // ── Spec 09b2: what a service does to the repair around it ──────────────────────────────────
  const subrentalIds: string[] = [];
  let links: SeededLinks | null = null;
  if (zones) {
    const insertOpenReport = async (
      bleacherUuid: string,
      createdAt: string,
      repairId: string | null,
    ) => {
      const res = await supabase
        .from("DamageReports")
        .insert({
          bleacher_uuid: bleacherUuid,
          seat_damage: "minor",
          haul_damage: "none",
          is_safe_to_sit: false,
          is_safe_to_haul: true,
          note: reportNote,
          maintenance_event_uuid: repairId,
          created_at: createdAt,
        })
        .select("id")
        .single();
      const id = check(res.data, res.error, "open report").id as string;
      reportIds.push(id);
      return id;
    };

    // Seven fresh bleachers; six in the zone of A, one with no zone.
    const linkBleacherRes = await supabase
      .from("Bleachers")
      .insert(
        [0, 1, 2, 3, 4, 5, 6].map((i) => ({
          bleacher_number: base + 100 + i,
          bleacher_rows: 5,
          bleacher_seats: 50,
          zone_uuid: i === 6 ? null : zones.a.uuid,
        })),
      )
      .select("id, bleacher_number");
    const linkBleachers = check(linkBleacherRes.data, linkBleacherRes.error, "link bleachers");
    extraBleacherIds.push(...linkBleachers.map((b) => b.id as string));
    const linkBleacher = (offset: number): BleacherRef => {
      const found = linkBleachers.find((b) => b.bleacher_number === base + 100 + offset);
      if (!found) throw new Error(`fixture link bleacher ${offset} missing`);
      return { uuid: found.id as string, number: base + 100 + offset };
    };
    const newRepairBleacher = linkBleacher(0);
    const oldBleacher = linkBleacher(1);
    const moveFrom = linkBleacher(2);
    const moveTo = linkBleacher(3);
    const completedBleacher = linkBleacher(4);
    const subrentalBleacher = linkBleacher(5);
    const noZoneBleacher = linkBleacher(6);

    // S34, S42: two open reports that no repair has, on a bleacher with no repair.
    const newRepairReportIds = [
      await insertOpenReport(newRepairBleacher.uuid, "2026-10-10T16:00:00Z", null),
      await insertOpenReport(newRepairBleacher.uuid, "2026-11-10T16:00:00Z", null),
    ];

    // S35: an open repair with a row on its bleacher and no services; one free open report and one
    // open report that belongs to the CAD repair.
    const oldInvoice = `E2E-OLD-${suffix}`;
    const oldRepairId = await insertEvent(
      {
        event_start: "2026-10-01",
        event_end: "2026-10-05",
        status: "inbound",
        currency: "USD",
        invoice_number: oldInvoice,
      },
      oldBleacher.uuid,
    );
    const oldFreeReportId = await insertOpenReport(oldBleacher.uuid, "2026-10-02T16:00:00Z", null);
    const oldElsewhereReportId = await insertOpenReport(
      oldBleacher.uuid,
      "2026-10-03T16:00:00Z",
      cadId,
    );

    // S36, S40, S41: an open repair made as the page makes it, on `moveFrom`.
    const moveInvoice = `E2E-MOVE-${suffix}`;
    const moveRepairId = await insertEvent(
      {
        event_start: "2026-10-12",
        event_end: "2026-10-15",
        status: "inbound",
        currency: "USD",
        invoice_number: moveInvoice,
        zone_uuid: zones.a.uuid,
      },
      moveFrom.uuid,
    );
    await insertService(moveRepairId, moveFrom.uuid, "Tires", "minor", SERVICE_TIRES);
    const moveLinkedReportId = await insertOpenReport(
      moveFrom.uuid,
      "2026-10-11T16:00:00Z",
      moveRepairId,
    );
    const moveFreeReportId = await insertOpenReport(moveTo.uuid, "2026-10-11T17:00:00Z", null);

    // S37: a Completed repair with a row on its bleacher and no services; one open report created
    // before it ended and one after.
    const completedLinksInvoice = `E2E-DONE-${suffix}`;
    const completedLinksEnd = "2026-09-29";
    const completedLinksId = await insertEvent(
      {
        event_start: "2026-09-20",
        event_end: completedLinksEnd,
        status: "completed",
        currency: "USD",
        invoice_number: completedLinksInvoice,
        completed_at: "2026-09-29T16:00:00Z",
      },
      completedBleacher.uuid,
    );
    const beforeReportId = await insertOpenReport(
      completedBleacher.uuid,
      "2026-09-25T16:00:00Z",
      null,
    );
    const afterReportId = await insertOpenReport(
      completedBleacher.uuid,
      "2026-10-10T16:00:00Z",
      null,
    );

    // S39: an accepted sub-rental on `subrentalBleacher` that borrows the other zone for November.
    const subrental = { from: "2026-11-01", to: "2026-11-30", day: "2026-11-02" };
    const subrentalRes = await supabase
      .from("SubrentalEvents")
      .insert({
        bleacher_uuid: subrentalBleacher.uuid,
        status: "accepted",
        requested_zone_uuid: zones.b.uuid,
        event_start: subrental.from,
        event_end: subrental.to,
      })
      .select("id")
      .single();
    subrentalIds.push(check(subrentalRes.data, subrentalRes.error, "sub-rental").id as string);

    links = {
      newRepairBleacher: { ...newRepairBleacher, reportIds: newRepairReportIds },
      noZoneBleacher,
      subrentalBleacher,
      subrental,
      oldRepair: {
        id: oldRepairId,
        invoice: oldInvoice,
        bleacher: oldBleacher,
        freeReportId: oldFreeReportId,
        elsewhereReportId: oldElsewhereReportId,
        elsewhereRepairId: cadId,
      },
      moveRepair: {
        id: moveRepairId,
        invoice: moveInvoice,
        from: moveFrom,
        to: moveTo,
        otherZoneBleacher: bleacherB,
        linkedReportId: moveLinkedReportId,
        freeReportId: moveFreeReportId,
      },
      completedRepair: {
        id: completedLinksId,
        invoice: completedLinksInvoice,
        bleacher: completedBleacher,
        eventEnd: completedLinksEnd,
        beforeReportId,
        afterReportId,
      },
    };
  }

  // ── Spec 09b3: the files of a repair ────────────────────────────────────────────────────────
  // Two fresh bleachers (smallint numbers, clear of the ones above): one holds a repair for each
  // scenario, the other holds nothing, for the New repair of S47.
  const filesBleacherRes = await supabase
    .from("Bleachers")
    .insert(
      [0, 1].map((i) => ({
        bleacher_number: base + 110 + i,
        bleacher_rows: 5,
        bleacher_seats: 50,
      })),
    )
    .select("id, bleacher_number");
  const filesBleachers = check(filesBleacherRes.data, filesBleacherRes.error, "files bleachers");
  extraBleacherIds.push(...filesBleachers.map((b) => b.id as string));
  const filesBleacherRef = (offset: number): BleacherRef => {
    const found = filesBleachers.find((b) => b.bleacher_number === base + 110 + offset);
    if (!found) throw new Error(`fixture files bleacher ${offset} missing`);
    return { uuid: found.id as string, number: base + 110 + offset };
  };
  const filesBleacher = filesBleacherRef(0);
  const newRepairFilesBleacher = filesBleacherRef(1);

  const insertFilesRepair = async (
    label: string,
    fileCount: number,
    fields: Record<string, unknown> = {},
  ): Promise<FilesRepair> => {
    const filesInvoice = `E2E-FILES-${label}-${suffix}`;
    const id = await insertEvent(
      {
        event_start: "2026-10-20",
        event_end: "2026-10-25",
        status: "inbound",
        currency: "USD",
        invoice_number: filesInvoice,
        ...fields,
      },
      filesBleacher.uuid,
    );
    const stored: FilesRepair["files"] = [];
    for (let i = 0; i < fileCount; i += 1) {
      const path = `${id}/${suffix}-${i}.png`;
      const upload = await supabase.storage
        .from(FILES_BUCKET)
        .upload(path, TINY_PNG, { contentType: "image/png", upsert: false });
      if (upload.error) throw new Error(`fixture file object failed: ${upload.error.message}`);
      const row = await supabase
        .from("MaintenancePhotos")
        .insert({
          maintenance_event_uuid: id,
          photo_path: path,
          created_at: `2026-10-20T16:0${i}:00Z`,
        })
        .select("id")
        .single();
      stored.push({ id: check(row.data, row.error, "file row").id as string, path });
    }
    return { id, invoice: filesInvoice, files: stored };
  };
  const files: SeededFiles = {
    bleacher: filesBleacher,
    newRepairBleacher: newRepairFilesBleacher,
    add: await insertFilesRepair("ADD", 1),
    remove: await insertFilesRepair("DEL", 2),
    edit: await insertFilesRepair("EDIT", 2),
    cancel: await insertFilesRepair("CANCEL", 1),
    none: await insertFilesRepair("NONE", 0),
    deleted: await insertFilesRepair("GONE", 1, {
      status: "completed",
      completed_at: "2026-10-25T16:00:00Z",
      deleted: true,
    }),
  };

  const completedTotal = await costOf(completedId);
  const cadTotal = await costOf(cadId);

  return {
    bleacherA: { ...bleacherA, modelNumber, typeName: (type?.name as string | undefined) ?? null },
    bleacherB,
    emptyBleacher,
    vendorName,
    vendorUuid: vendorId,
    zones,
    completed: { invoice, totalCents: completedTotal, notes: completedNotes },
    cad: { totalCents: cadTotal, notes: cadNotes },
    deleted: { invoice: deletedInvoice },
    deletedServices: {
      invoice: deletedServicesInvoice,
      liveCategory: "Tires",
      removedCategory: "Welding",
    },
    reportNote,
    photoPath,
    vendorAddress: "E2E City, TX, US",
    repairFiles,
    links,
    files,
    cleanup: async () => {
      const bleacherIds = [...bleachers.map((b) => b.id as string), ...extraBleacherIds];

      // What the 09b2 scenarios made through the page: repairs and services on the fixture bleachers,
      // and the damage reports of those bleachers (their links point at repairs, so they go first).
      const madeReports = await supabase
        .from("DamageReports")
        .select("id")
        .in("bleacher_uuid", bleacherIds);
      const allReportIds = [
        ...new Set([...reportIds, ...(madeReports.data ?? []).map((r) => r.id as string)]),
      ];
      const madeJunction = await supabase
        .from("BleacherMaintEvents")
        .select("maintenance_event_uuid")
        .in("bleacher_uuid", bleacherIds);
      const madeServices = await supabase
        .from("MaintenanceLineItems")
        .select("maintenance_event_uuid")
        .in("bleacher_uuid", bleacherIds);
      const allEventIds = [
        ...new Set([
          ...eventIds,
          ...(madeJunction.data ?? []).map((r) => r.maintenance_event_uuid as string),
          ...(madeServices.data ?? []).map((r) => r.maintenance_event_uuid as string),
        ]),
      ];

      await supabase.from("DamageReportPhotos").delete().in("damage_report_uuid", allReportIds);
      await supabase.from("DamageReports").delete().in("id", allReportIds);
      await supabase.from("SubrentalEvents").delete().in("id", subrentalIds);
      // The objects of the files, from the rows and from the folders of the repairs of the files
      // fixtures (a file that failed half-way leaves an object with no row). A path that does not
      // exist is not an error for `remove`.
      const fileRows = await supabase
        .from("MaintenancePhotos")
        .select("photo_path")
        .in("maintenance_event_uuid", allEventIds);
      const onFilesBleachers = await supabase
        .from("BleacherMaintEvents")
        .select("maintenance_event_uuid")
        .in("bleacher_uuid", [filesBleacher.uuid, newRepairFilesBleacher.uuid]);
      const objectPaths = new Set((fileRows.data ?? []).map((r) => r.photo_path as string));
      for (const folder of new Set(
        (onFilesBleachers.data ?? []).map((r) => r.maintenance_event_uuid as string),
      )) {
        const listed = await supabase.storage.from(FILES_BUCKET).list(folder);
        for (const object of listed.data ?? []) objectPaths.add(`${folder}/${object.name}`);
      }
      if (objectPaths.size > 0) {
        await supabase.storage.from(FILES_BUCKET).remove([...objectPaths]);
      }
      await supabase.from("MaintenancePhotos").delete().in("maintenance_event_uuid", allEventIds);
      await supabase
        .from("MaintenanceLineItems")
        .delete()
        .in("maintenance_event_uuid", allEventIds);
      await supabase.from("BleacherMaintEvents").delete().in("maintenance_event_uuid", allEventIds);
      await supabase.from("MaintenanceEvents").delete().in("id", allEventIds);
      await supabase.from("Vendors").delete().eq("id", vendorId);
      await supabase.from("Addresses").delete().eq("id", addressId);
      await supabase.from("Bleachers").delete().in("id", bleacherIds);
    },
  };
}

/** `$1,234.56`, as the page writes an amount in cents. */
export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `C$1,234.56`. */
export function cad(cents: number): string {
  return `C$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
