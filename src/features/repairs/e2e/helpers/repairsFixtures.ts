import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Seeds the repairs the Repairs page specs look at, straight into the database with the service
 * role (the page cannot create them yet). Everything is namespaced and `cleanup` removes it all.
 * docs/specs/repairs-04-table.md §6 and docs/specs/repairs-05-toolbar.md §6 (the zones, the vendor
 * uuid and the notes, which the toolbar specs look for) and docs/specs/repairs-06-expanded-row.md
 * §6 (a model number and a type on bleacher A, a photo on the first report, and a deleted repair
 * with a service that was deleted on its own).
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

/** The two services of the first repair, in cents. */
export const SERVICE_TIRES = { labor: 1500, parts: 11600, tax: 783, freight: 0 };
export const SERVICE_WELDING = { labor: 41500, parts: 0, tax: 0, freight: 6500 };
/** The one service of the CAD repair. */
export const SERVICE_CAD = { labor: 0, parts: 25000, tax: 3250, freight: 0 };

/** How many cheap completed repairs sit on the second bleacher (one more than a page of 25). */
export const PAGER_REPAIRS = 26;

/** The days of the damage reports linked to the repairs (Toronto and UTC agree at 16:00Z). */
export const REPORT_DAYS = { first: "2026-09-17", second: "2026-09-19", cad: "2026-09-20" };

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

  const vendorName = `E2E Vendor ${suffix}`;
  const vendorRes = await supabase
    .from("Vendors")
    .insert({ display_name: vendorName })
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
  const reportIds: string[] = [];
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
    cleanup: async () => {
      await supabase.from("DamageReportPhotos").delete().in("damage_report_uuid", reportIds);
      await supabase.from("DamageReports").delete().in("id", reportIds);
      await supabase.from("MaintenanceLineItems").delete().in("maintenance_event_uuid", eventIds);
      await supabase.from("BleacherMaintEvents").delete().in("maintenance_event_uuid", eventIds);
      await supabase.from("MaintenanceEvents").delete().in("id", eventIds);
      await supabase.from("Vendors").delete().eq("id", vendorId);
      await supabase
        .from("Bleachers")
        .delete()
        .in(
          "id",
          bleachers.map((b) => b.id as string),
        );
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
