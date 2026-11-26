import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceRoleClient } from "../../../repairs/e2e/helpers/repairsFixtures";
import { convertCents } from "../../utils/exchangeRates";

/**
 * Seeds what the Dashboard & Analytics specs look at, straight into the database with the service
 * role, in the way `repairs/e2e/helpers/repairsFixtures.ts` does: fresh bleachers, repairs with
 * services, and a budget row, all removed by `cleanup`. It also holds the *oracles*: the figures
 * of the page worked out from the database by an independent query, because the e2e database already
 * holds repairs and other specs seed theirs at the same time, so a spec cannot assume a total. A
 * spec waits until the card equals the oracle, and checks its own seeds against the oracle.
 * docs/specs/dashboard-analytics-05-page.md §6 (S6 to S13).
 *
 * It writes `MaintenanceEvents`, `MaintenanceLineItems`, `BleacherMaintEvents`, `Bleachers` and
 * `MaintenanceBudgets`, which reach a user's device only where the sync rules of
 * docs/specs/repairs-02-sync-rules.md and docs/specs/dashboard-analytics-04-data-numbers.md §2.9 are
 * deployed.
 */

/** The amounts of one service, in cents. */
export type ServiceAmounts = { labor: number; parts: number; tax: number; freight: number };

/** The sum of the four amounts of a service. */
export const serviceTotal = (a: ServiceAmounts) => a.labor + a.parts + a.tax + a.freight;

/** One USD service and one CAD service, the amounts the scenarios add up. */
export const SERVICE_USD: ServiceAmounts = { labor: 10000, parts: 20000, tax: 3000, freight: 500 };
export const SERVICE_USD_2: ServiceAmounts = { labor: 41500, parts: 0, tax: 0, freight: 6500 };
export const SERVICE_CAD: ServiceAmounts = { labor: 0, parts: 25000, tax: 3250, freight: 0 };

/** Years no real repair is in, one for each scenario that must read an exact total. */
export const YEARS = { list: 2001, converted: 2002, noRate: 2003 };

export type RepairStatus =
  | "inbound"
  | "triaged"
  | "waiting_repair"
  | "in_repair"
  | "confirm_repair"
  | "completed";

type BleacherRef = { uuid: string; number: number };

function check<T>(value: T | null, error: { message: string } | null, what: string): T {
  if (error || value === null) throw new Error(`fixture ${what} failed: ${error?.message}`);
  return value;
}

/** Every row of a query, a page of 1000 at a time (the service role is capped at 1000). */
async function fetchAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    const chunk = check(data, error, what);
    rows.push(...chunk);
    if (chunk.length < 1000) return rows;
  }
}

// ---- The oracles ---------------------------------------------------------------------------------

/**
 * The spend of a period in cents, from the database, by the rules of spec 04: every live repair of
 * the period; a repair with services counts the sum of their four amounts, one with none counts its
 * stored cost; a CAD repair is converted whole at `cadRate` (the rate the spec's API stand-in
 * answers for every day), or left out when `cadRate` is null (no rate known).
 */
export async function expectedSpendCents(
  supabase: SupabaseClient,
  period: { year: number } | "all",
  cadRate: number | null,
): Promise<number> {
  const repairs = await fetchAll<{
    id: string;
    event_start: string | null;
    currency: string | null;
    cost_cents: number | null;
  }>(
    (from, to) =>
      supabase
        .from("MaintenanceEvents")
        .select("id, event_start, currency, cost_cents")
        .eq("deleted", false)
        .order("id")
        .range(from, to),
    "oracle repairs",
  );
  const services = await fetchAll<{
    maintenance_event_uuid: string | null;
    labor_cents: number | null;
    parts_cents: number | null;
    tax_cents: number | null;
    freight_cents: number | null;
  }>(
    (from, to) =>
      supabase
        .from("MaintenanceLineItems")
        .select("maintenance_event_uuid, labor_cents, parts_cents, tax_cents, freight_cents")
        .eq("deleted", false)
        .order("id")
        .range(from, to),
    "oracle services",
  );

  const byRepair = new Map<string, number>();
  for (const s of services) {
    if (s.maintenance_event_uuid === null) continue;
    const sum =
      (s.labor_cents ?? 0) + (s.parts_cents ?? 0) + (s.tax_cents ?? 0) + (s.freight_cents ?? 0);
    byRepair.set(s.maintenance_event_uuid, (byRepair.get(s.maintenance_event_uuid) ?? 0) + sum);
  }

  let total = 0;
  for (const repair of repairs) {
    const day = repair.event_start ?? "";
    if (period !== "all" && Number(day.slice(0, 4)) !== period.year) continue;
    const cents = byRepair.get(repair.id) ?? repair.cost_cents ?? 0;
    if (repair.currency === "CAD") {
      if (cadRate !== null) total += convertCents(cents, cadRate);
    } else {
      total += cents;
    }
  }
  return total;
}

/**
 * Bleachers Ready from the database: how many live bleachers are not in a live repair that is not
 * Completed, and which ones are.
 */
export async function expectedReady(
  supabase: SupabaseClient,
): Promise<{ ready: number; total: number; busy: Set<string> }> {
  const bleachers = await fetchAll<{ id: string }>(
    (from, to) =>
      supabase.from("Bleachers").select("id").eq("deleted", false).order("id").range(from, to),
    "oracle bleachers",
  );
  const open = await fetchAll<{ id: string }>(
    (from, to) =>
      supabase
        .from("MaintenanceEvents")
        .select("id")
        .eq("deleted", false)
        .neq("status", "completed")
        .order("id")
        .range(from, to),
    "oracle open repairs",
  );
  const links = await fetchAll<{ maintenance_event_uuid: string; bleacher_uuid: string }>(
    (from, to) =>
      supabase
        .from("BleacherMaintEvents")
        .select("maintenance_event_uuid, bleacher_uuid")
        .order("maintenance_event_uuid")
        .range(from, to),
    "oracle junction",
  );
  const openIds = new Set(open.map((r) => r.id));
  const live = new Set(bleachers.map((b) => b.id));
  const busy = new Set<string>();
  for (const link of links) {
    if (openIds.has(link.maintenance_event_uuid) && live.has(link.bleacher_uuid)) {
      busy.add(link.bleacher_uuid);
    }
  }
  return { ready: live.size - busy.size, total: live.size, busy };
}

// ---- The seeds -----------------------------------------------------------------------------------

export type AnalyticsFixtures = Awaited<ReturnType<typeof createAnalyticsFixtures>>;

export async function createAnalyticsFixtures() {
  const supabase = serviceRoleClient();
  const suffix = randomUUID().slice(0, 8);
  // bleacher_number is a smallint; this range is clear of the other fixtures (26000 to 27999).
  const base = 26000 + Math.floor(Math.random() * 1900);
  let nextBleacher = 0;

  const bleacherIds: string[] = [];
  const eventIds: string[] = [];
  /** A budget row this fixture made, or the row it replaced and must put back. */
  const budgets: { id: string; year: number; restore: number | null }[] = [];

  const categoryRes = await supabase
    .from("DamageCategories")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  const categoryId = check(categoryRes.data?.[0] ?? null, categoryRes.error, "category")
    .id as string;

  async function addBleacher(): Promise<BleacherRef> {
    const number = base + nextBleacher++;
    const res = await supabase
      .from("Bleachers")
      .insert({ bleacher_number: number, bleacher_rows: 5, bleacher_seats: 50 })
      .select("id")
      .single();
    const id = check(res.data, res.error, "bleacher").id as string;
    bleacherIds.push(id);
    return { uuid: id, number };
  }

  /**
   * A live repair of `day` on `bleacher`, with one service per amount set in `services`, or with
   * the stored `costCents` and no service. The database sums the services into the cost of the
   * repair, as it does for the page.
   */
  async function addRepair(params: {
    day: string;
    bleacher: BleacherRef;
    status?: RepairStatus;
    currency?: "USD" | "CAD";
    services?: ServiceAmounts[];
    costCents?: number;
  }): Promise<{ id: string; cents: number }> {
    const status = params.status ?? "inbound";
    const res = await supabase
      .from("MaintenanceEvents")
      .insert({
        event_name: "Maintenance / Repair",
        event_start: params.day,
        event_end: params.day,
        status,
        currency: params.currency ?? "USD",
        notes: `e2e analytics ${suffix}`,
        ...(params.costCents !== undefined ? { cost_cents: params.costCents } : {}),
        ...(status === "completed" ? { completed_at: `${params.day}T16:00:00Z` } : {}),
      })
      .select("id")
      .single();
    const id = check(res.data, res.error, "repair").id as string;
    eventIds.push(id);

    const junction = await supabase
      .from("BleacherMaintEvents")
      .insert({ maintenance_event_uuid: id, bleacher_uuid: params.bleacher.uuid });
    if (junction.error) throw new Error(`fixture junction failed: ${junction.error.message}`);

    for (const amounts of params.services ?? []) {
      const service = await supabase.from("MaintenanceLineItems").insert({
        maintenance_event_uuid: id,
        bleacher_uuid: params.bleacher.uuid,
        damage_category_uuid: categoryId,
        severity: "minor",
        labor_cents: amounts.labor,
        parts_cents: amounts.parts,
        tax_cents: amounts.tax,
        freight_cents: amounts.freight,
      });
      if (service.error) throw new Error(`fixture service failed: ${service.error.message}`);
    }
    const cents = params.services?.length
      ? params.services.reduce((sum, a) => sum + serviceTotal(a), 0)
      : (params.costCents ?? 0);
    return { id, cents };
  }

  async function setStatus(repairId: string, status: RepairStatus) {
    const res = await supabase
      .from("MaintenanceEvents")
      .update({
        status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", repairId);
    if (res.error) throw new Error(`fixture status failed: ${res.error.message}`);
  }

  /** Sets the USD budget of a year, and remembers what to put back. */
  async function setBudget(year: number, amountCents: number) {
    const existing = await supabase
      .from("MaintenanceBudgets")
      .select("id, amount_cents")
      .eq("year", year)
      .eq("currency", "USD")
      .maybeSingle();
    if (existing.error) throw new Error(`fixture budget read failed: ${existing.error.message}`);
    if (existing.data) {
      if (!budgets.some((b) => b.year === year)) {
        budgets.push({
          id: existing.data.id as string,
          year,
          restore: existing.data.amount_cents as number,
        });
      }
      const update = await supabase
        .from("MaintenanceBudgets")
        .update({ amount_cents: amountCents })
        .eq("id", existing.data.id);
      if (update.error) throw new Error(`fixture budget update failed: ${update.error.message}`);
      return;
    }
    const insert = await supabase
      .from("MaintenanceBudgets")
      .insert({ year, currency: "USD", amount_cents: amountCents })
      .select("id")
      .single();
    const id = check(insert.data, insert.error, "budget").id as string;
    budgets.push({ id, year, restore: null });
  }

  return {
    supabase,
    addBleacher,
    addRepair,
    setStatus,
    setBudget,
    cleanup: async () => {
      await supabase.from("MaintenanceLineItems").delete().in("maintenance_event_uuid", eventIds);
      await supabase.from("BleacherMaintEvents").delete().in("maintenance_event_uuid", eventIds);
      await supabase.from("MaintenanceEvents").delete().in("id", eventIds);
      await supabase.from("Bleachers").delete().in("id", bleacherIds);
      for (const budget of budgets) {
        if (budget.restore === null) {
          await supabase.from("MaintenanceBudgets").delete().eq("id", budget.id);
        } else {
          await supabase
            .from("MaintenanceBudgets")
            .update({ amount_cents: budget.restore })
            .eq("id", budget.id);
        }
      }
    },
  };
}

/** Runs `run` with fresh fixtures and removes them afterwards, whatever the scenario did. */
export async function withFixtures<T>(run: (fx: AnalyticsFixtures) => Promise<T>): Promise<T> {
  const fx = await createAnalyticsFixtures();
  try {
    return await run(fx);
  } finally {
    await fx.cleanup();
  }
}
