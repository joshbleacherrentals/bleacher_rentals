import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../database.types";

export type ActionType =
  | "create"
  | "update"
  | "sign"
  | "send"
  | "status_change"
  | "line_item_add"
  | "line_item_remove"
  | "line_item_change";

export const TRACKED_FIELDS = [
  "event_name",
  "event_start",
  "event_end",
  "event_status",
  "event_type_uuid",
  "contact_uuid",
  "finance_contact_uuid",
  "address_uuid",
  "venue_uuid",
  "sales_office_uuid",
  "terms_and_conditions_uuid",
  "quote_valid_till",
  "notes",
  "internal_notes",
  "external_notes",
  "tax_percent",
  "tax_amount_cents",
  "contract_revenue_cents",
  "po_number",
  "created_by_user_uuid",
] as const;

export const FIELD_LABELS: Record<string, string> = {
  event_name: "Event Name",
  event_start: "Start Date",
  event_end: "End Date",
  event_status: "Status",
  event_type_uuid: "Event Type",
  contact_uuid: "Contact",
  finance_contact_uuid: "Finance Contact",
  address_uuid: "Address",
  venue_uuid: "Venue",
  sales_office_uuid: "Sales Office",
  terms_and_conditions_uuid: "Terms & Conditions",
  quote_valid_till: "Quote Valid Till",
  notes: "Notes",
  internal_notes: "Internal Notes",
  external_notes: "Client-Facing Notes",
  tax_percent: "Tax %",
  tax_amount_cents: "Tax Amount",
  contract_revenue_cents: "Contract Total",
  po_number: "PO Number",
  created_by_user_uuid: "Account Manager",
  line_item: "Line Item",
  signature: "Contract Signature",
  email_sent: "Email Sent",
  is_qbo: "QuickBooks Invoice",
  deleted: "Deleted",
};

const UUID_FIELDS_TO_SKIP_RAW = new Set([
  "contact_uuid",
  "finance_contact_uuid",
  "sales_office_uuid",
  "event_type_uuid",
  "terms_and_conditions_uuid",
  "created_by_user_uuid",
  "address_uuid",
  "venue_uuid",
]);

const CENTS_FIELDS = new Set(["tax_amount_cents", "contract_revenue_cents"]);

export function formatCentsForLog(cents: unknown, currency = "USD"): string {
  if (cents == null || cents === 0) return "$0.00";
  const num = typeof cents === "number" ? cents : Number(cents);
  if (isNaN(num)) return String(cents);
  const abs = Math.abs(num);
  const formatted = (abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = num < 0 ? "-" : "";
  return `${sign}$${formatted} ${currency}`;
}

type ResolvedNames = Record<string, string>;

async function resolveUuid(
  supabase: SupabaseClient<Database>,
  field: string,
  uuid: string,
): Promise<string> {
  if (field === "contact_uuid" || field === "finance_contact_uuid") {
    const { data } = await supabase
      .from("Contacts")
      .select("first_name, last_name")
      .eq("id", uuid)
      .single();
    return data ? `${data.first_name} ${data.last_name ?? ""}`.trim() : uuid;
  }
  if (field === "sales_office_uuid") {
    const { data } = await supabase.from("SalesOffices").select("name").eq("id", uuid).single();
    return data?.name ?? uuid;
  }
  if (field === "event_type_uuid") {
    const { data } = await supabase.from("EventTypes").select("name").eq("id", uuid).single();
    return data?.name ?? uuid;
  }
  if (field === "terms_and_conditions_uuid") {
    const { data } = await supabase
      .from("TermsAndConditions")
      .select("name")
      .eq("id", uuid)
      .single();
    return data?.name ?? uuid;
  }
  if (field === "created_by_user_uuid") {
    const { data } = await supabase
      .from("Users")
      .select("first_name, last_name")
      .eq("id", uuid)
      .single();
    return data ? `${data.first_name} ${data.last_name ?? ""}`.trim() : uuid;
  }
  return uuid;
}

async function resolveAllUuids(
  supabase: SupabaseClient<Database>,
  pairs: Array<{ field: string; uuid: string }>,
): Promise<ResolvedNames> {
  const result: ResolvedNames = {};
  const seen = new Set<string>();
  const tasks: Promise<void>[] = [];

  for (const { field, uuid } of pairs) {
    const key = `${field}:${uuid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tasks.push(
      resolveUuid(supabase, field, uuid).then((name) => {
        result[key] = name;
      }),
    );
  }

  await Promise.all(tasks);
  return result;
}

function serialize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function logEventChanges(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string | null,
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
  actionType: ActionType = "update",
  currency = "USD",
): Promise<void> {
  // Collect all UUIDs that need resolution (both old and new)
  const pairs: Array<{ field: string; uuid: string }> = [];
  for (const key of Object.keys(newState)) {
    if (!UUID_FIELDS_TO_SKIP_RAW.has(key)) continue;
    const oldVal = oldState[key];
    const newVal = newState[key];
    if (!valuesEqual(oldVal, newVal)) {
      if (typeof oldVal === "string" && oldVal) pairs.push({ field: key, uuid: oldVal });
      if (typeof newVal === "string" && newVal) pairs.push({ field: key, uuid: newVal });
    }
  }

  const resolvedNames: ResolvedNames =
    pairs.length > 0 ? await resolveAllUuids(supabase, pairs) : {};

  const rows: Array<{
    event_uuid: string;
    changed_by_user_uuid: string | null;
    field_name: string;
    prev_value: string | null;
    next_value: string | null;
    action_type: string;
  }> = [];

  for (const key of Object.keys(newState)) {
    const oldVal = oldState[key];
    const newVal = newState[key];
    if (valuesEqual(oldVal, newVal)) continue;

    let prevDisplay: string | null;
    let nextDisplay: string | null;

    if (UUID_FIELDS_TO_SKIP_RAW.has(key)) {
      prevDisplay = oldVal ? (resolvedNames[`${key}:${oldVal}`] ?? serialize(oldVal)) : null;
      nextDisplay = newVal ? (resolvedNames[`${key}:${newVal}`] ?? serialize(newVal)) : null;
    } else if (CENTS_FIELDS.has(key)) {
      prevDisplay = oldVal != null ? formatCentsForLog(oldVal, currency) : null;
      nextDisplay = newVal != null ? formatCentsForLog(newVal, currency) : null;
    } else {
      prevDisplay = serialize(oldVal);
      nextDisplay = serialize(newVal);
    }

    rows.push({
      event_uuid: eventId,
      changed_by_user_uuid: userId,
      field_name: key,
      prev_value: prevDisplay,
      next_value: nextDisplay,
      action_type: actionType,
    });
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("EventChangeLog").insert(rows);
  if (error) {
    console.error("Failed to log event changes:", error.message);
  }
}

export type SimpleLineItem = {
  label: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export async function logLineItemChanges(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string | null,
  oldItems: SimpleLineItem[],
  newItems: SimpleLineItem[],
  currency = "USD",
): Promise<void> {
  const rows: Array<{
    event_uuid: string;
    changed_by_user_uuid: string | null;
    field_name: string;
    prev_value: string | null;
    next_value: string | null;
    action_type: string;
  }> = [];

  const oldByLabel = new Map<string, SimpleLineItem[]>();
  for (const li of oldItems) {
    const list = oldByLabel.get(li.label) ?? [];
    list.push(li);
    oldByLabel.set(li.label, list);
  }

  const newByLabel = new Map<string, SimpleLineItem[]>();
  for (const li of newItems) {
    const list = newByLabel.get(li.label) ?? [];
    list.push(li);
    newByLabel.set(li.label, list);
  }

  const allLabels = new Set([...oldByLabel.keys(), ...newByLabel.keys()]);

  for (const label of allLabels) {
    const oldList = oldByLabel.get(label) ?? [];
    const newList = newByLabel.get(label) ?? [];

    if (oldList.length === 0 && newList.length > 0) {
      for (const li of newList) {
        rows.push({
          event_uuid: eventId,
          changed_by_user_uuid: userId,
          field_name: "line_item",
          prev_value: null,
          next_value: `${li.label} x${li.qty} @ ${formatCentsForLog(li.unitPriceCents, currency)}`,
          action_type: "line_item_add",
        });
      }
    } else if (oldList.length > 0 && newList.length === 0) {
      for (const li of oldList) {
        rows.push({
          event_uuid: eventId,
          changed_by_user_uuid: userId,
          field_name: "line_item",
          prev_value: `${li.label} x${li.qty} @ ${formatCentsForLog(li.unitPriceCents, currency)}`,
          next_value: null,
          action_type: "line_item_remove",
        });
      }
    } else {
      // Compare first match — if qty or price changed, log it
      const oldLi = oldList[0];
      const newLi = newList[0];
      const changes: string[] = [];

      if (oldLi.qty !== newLi.qty) {
        changes.push(`qty ${oldLi.qty} → ${newLi.qty}`);
      }
      if (oldLi.unitPriceCents !== newLi.unitPriceCents) {
        changes.push(
          `price ${formatCentsForLog(oldLi.unitPriceCents, currency)} → ${formatCentsForLog(newLi.unitPriceCents, currency)}`,
        );
      }

      if (changes.length > 0) {
        rows.push({
          event_uuid: eventId,
          changed_by_user_uuid: userId,
          field_name: "line_item",
          prev_value: `${oldLi.label} x${oldLi.qty} @ ${formatCentsForLog(oldLi.unitPriceCents, currency)}`,
          next_value: `${newLi.label} x${newLi.qty} @ ${formatCentsForLog(newLi.unitPriceCents, currency)} (${changes.join(", ")})`,
          action_type: "line_item_change",
        });
      }

      // Handle count differences (added/removed duplicates)
      if (newList.length > oldList.length) {
        for (let i = oldList.length; i < newList.length; i++) {
          const li = newList[i];
          rows.push({
            event_uuid: eventId,
            changed_by_user_uuid: userId,
            field_name: "line_item",
            prev_value: null,
            next_value: `${li.label} x${li.qty} @ ${formatCentsForLog(li.unitPriceCents, currency)}`,
            action_type: "line_item_add",
          });
        }
      } else if (oldList.length > newList.length) {
        for (let i = newList.length; i < oldList.length; i++) {
          const li = oldList[i];
          rows.push({
            event_uuid: eventId,
            changed_by_user_uuid: userId,
            field_name: "line_item",
            prev_value: `${li.label} x${li.qty} @ ${formatCentsForLog(li.unitPriceCents, currency)}`,
            next_value: null,
            action_type: "line_item_remove",
          });
        }
      }
    }
  }

  if (rows.length === 0) return;

  const { error } = await supabase.from("EventChangeLog").insert(rows);
  if (error) {
    console.error("Failed to log line item changes:", error.message);
  }
}

export async function logSingleChange(
  supabase: SupabaseClient<Database>,
  eventId: string,
  userId: string | null,
  fieldName: string,
  prevValue: unknown,
  nextValue: unknown,
  actionType: ActionType,
): Promise<void> {
  const { error } = await supabase.from("EventChangeLog").insert({
    event_uuid: eventId,
    changed_by_user_uuid: userId,
    field_name: fieldName,
    prev_value: serialize(prevValue),
    next_value: serialize(nextValue),
    action_type: actionType,
  });
  if (error) {
    console.error("Failed to log event change:", error.message);
  }
}
