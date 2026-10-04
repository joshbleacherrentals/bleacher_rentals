"use client";

import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { FIELD_LABELS } from "../../../db/logEventChanges";
import { usePaymentHistory } from "../../../hooks/usePaymentHistory";
import { paymentLogLabel, type PaymentForEdit } from "../../../utils/paymentEdit";
import { X, Eye, CheckCircle2, XCircle, Mail } from "lucide-react";
import { getTrigger } from "@/features/automaticEmails/triggers";

type EmailLogRow = {
  id: string;
  trigger: string | null;
  status: string | null;
  reason: string | null;
  to_email: string | null;
  template_id: string | null;
  fired_at: string | null;
};

type LogRow = {
  id: string;
  action_type: string | null;
  field_name: string | null;
  prev_value: string | null;
  next_value: string | null;
  changed_at: string | null;
  changed_by_user_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
};

const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  create: { icon: "🟢", color: "text-green-600", label: "Created" },
  update: { icon: "🔵", color: "text-blue-600", label: "Updated" },
  sign: { icon: "✍️", color: "text-purple-600", label: "Signed" },
  send: { icon: "📧", color: "text-indigo-600", label: "Sent" },
  status_change: { icon: "🔄", color: "text-orange-600", label: "Status Changed" },
  line_item_add: { icon: "➕", color: "text-green-600", label: "Added" },
  line_item_remove: { icon: "➖", color: "text-red-600", label: "Removed" },
  line_item_change: { icon: "✏️", color: "text-amber-600", label: "Changed" },
  payment_edit: { icon: "💳", color: "text-amber-600", label: "Payment edited" },
  payment_delete: { icon: "🗑️", color: "text-red-600", label: "Payment deleted" },
};

export function isClientEvent(row: LogRow): boolean {
  return row.action_type?.startsWith("client_") ?? false;
}

export function getClientTitle(row: LogRow): string {
  switch (row.action_type) {
    case "client_page_view":
      return `Viewed quote${row.next_value ? ` #${row.next_value}` : ""}`;
    case "client_tab_change":
      return `Navigated to "${row.next_value ?? ""}"`;
    case "client_contract_signed":
      return `Signed contract${row.next_value ? ` as "${row.next_value}"` : ""}`;
    case "client_po_submitted":
      return `Submitted PO #${row.next_value ?? ""}`;
    case "client_payment_started":
      return `Initiated payment${row.next_value ? ` of ${row.next_value}` : ""}`;
    case "client_pdf_download":
      return "Downloaded PDF";
    case "client_language_change":
      // The client corrected the language on their own — the contact record
      // still has the wrong one until someone updates it.
      return `Switched language to ${row.next_value ?? ""}`;
    default:
      return "Customer activity";
  }
}

function formatDateTime(d: string | null): string {
  if (!d) return "";
  const dt = DateTime.fromISO(d);
  return dt.isValid ? dt.toFormat("MM/dd/yyyy h:mm a") : "";
}

function formatValue(val: string | null): string {
  if (val === null || val === undefined) return "—";
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === "object" && parsed !== null) {
      return JSON.stringify(parsed, null, 2);
    }
    return String(parsed);
  } catch {
    return val;
  }
}

/**
 * A row's title. `payments` are the event's payments, so that a payment edit or deletion — whose
 * field_name is `payment:<id>`, not a label — can say which payment it was.
 */
export function getTitle(row: LogRow, payments: readonly PaymentForEdit[] = []): string {
  const config = ACTION_CONFIG[row.action_type ?? "update"] ?? ACTION_CONFIG.update;
  const fieldLabel = FIELD_LABELS[row.field_name ?? ""] ?? row.field_name ?? "";

  if (row.action_type === "payment_edit" || row.action_type === "payment_delete") {
    return `${config.label}: ${paymentLogLabel(row.field_name, payments)}`;
  }

  if (row.action_type === "create") {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
    return name ? `Quote Created by ${name}` : "Quote Created";
  }
  if (row.action_type === "sign") return "Contract Signed";
  if (row.action_type === "send") return `Quote Sent to ${row.next_value ?? "client"}`;
  if (row.action_type === "line_item_add") return `Line Item Added`;
  if (row.action_type === "line_item_remove") return `Line Item Removed`;
  if (row.action_type === "line_item_change") return `Line Item Changed`;
  if (row.action_type === "status_change" && row.field_name === "deleted") return "Quote Deleted";
  return `${config.label}: ${fieldLabel}`;
}

/**
 * The second line of a payment row: what an edit changed (previous → next), or, for a deletion, the
 * payment's description when the title could not carry it. Never a reason: a deletion's row does not
 * have one (docs/specs/accountant-quotes-09, D7). Null for every other row.
 */
export function getDetail(row: LogRow, payments: readonly PaymentForEdit[] = []): string | null {
  if (row.action_type === "payment_edit") {
    return `${row.prev_value ?? "—"} → ${row.next_value ?? "—"}`;
  }
  if (row.action_type === "payment_delete") {
    const label = paymentLogLabel(row.field_name, payments);
    return row.prev_value && row.prev_value !== label ? row.prev_value : null;
  }
  return null;
}

function ChangeDetailModal({
  log,
  payments,
  onClose,
}: {
  log: LogRow;
  payments: readonly PaymentForEdit[];
  onClose: () => void;
}) {
  const userName = [log.first_name, log.last_name].filter(Boolean).join(" ") || "System";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-base">{getTitle(log, payments)}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                Changed by
              </p>
              <p className="font-medium text-gray-800">{userName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                When
              </p>
              <p className="font-medium text-gray-800">{formatDateTime(log.changed_at)}</p>
            </div>
          </div>

          {log.action_type === "payment_edit" && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Previous
                </span>
                <p className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm whitespace-pre-wrap break-words">
                  {formatValue(log.prev_value)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  New
                </span>
                <p className="bg-green-50 border border-green-100 rounded-lg p-3 text-sm whitespace-pre-wrap break-words">
                  {formatValue(log.next_value)}
                </p>
              </div>
            </div>
          )}

          {log.action_type === "payment_delete" && (
            <div className="text-sm">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                Deleted payment
              </span>
              <p className="font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
                {log.prev_value ?? paymentLogLabel(log.field_name, payments)}
              </p>
            </div>
          )}

          {log.action_type === "update" && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Previous
                </span>
                <pre className="bg-red-50 border border-red-100 rounded-lg p-3 text-xs whitespace-pre-wrap break-words min-h-[40px]">
                  {formatValue(log.prev_value)}
                </pre>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  New
                </span>
                <pre className="bg-green-50 border border-green-100 rounded-lg p-3 text-xs whitespace-pre-wrap break-words min-h-[40px]">
                  {formatValue(log.next_value)}
                </pre>
              </div>
            </div>
          )}

          {log.action_type === "line_item_add" && (
            <div className="text-sm">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                Added
              </span>
              <p className="font-medium text-green-700 bg-green-50 border border-green-100 rounded-lg p-3">
                {log.next_value}
              </p>
            </div>
          )}

          {log.action_type === "line_item_remove" && (
            <div className="text-sm">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                Removed
              </span>
              <p className="font-medium text-red-700 bg-red-50 border border-red-100 rounded-lg p-3">
                {log.prev_value}
              </p>
            </div>
          )}

          {log.action_type === "line_item_change" && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Before
                </span>
                <p className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm">
                  {log.prev_value}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  After
                </span>
                <p className="bg-green-50 border border-green-100 rounded-lg p-3 text-sm">
                  {log.next_value}
                </p>
              </div>
            </div>
          )}

          {log.action_type === "send" && (
            <div className="text-sm">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                Sent to
              </span>
              <p className="font-medium text-gray-800">{log.next_value ?? "—"}</p>
            </div>
          )}

          {log.action_type === "status_change" && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Previous Status
                </span>
                <p className="bg-red-50 border border-red-100 rounded-lg p-3 font-medium">
                  {formatValue(log.prev_value)}
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  New Status
                </span>
                <p className="bg-green-50 border border-green-100 rounded-lg p-3 font-medium">
                  {formatValue(log.next_value)}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientActivityRow({ log }: { log: LogRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50/70 border border-amber-100 mb-2">
      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <Eye className="w-3.5 h-3.5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-800">{getClientTitle(log)}</p>
          <span className="bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
            Customer
          </span>
        </div>
        {(log.action_type === "client_tab_change" ||
          log.action_type === "client_language_change") &&
          log.prev_value && (
            <p className="text-xs text-gray-400 mt-0.5">
              {log.prev_value} → {log.next_value}
            </p>
          )}
      </div>
      <p className="text-xs text-gray-400 shrink-0">{formatDateTime(log.changed_at)}</p>
    </div>
  );
}

export function LogTab({ quoteId }: { quoteId: string }) {
  const [selectedLog, setSelectedLog] = useState<LogRow | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"internal" | "customer" | "emails">("internal");

  const compiled = useMemo(
    () =>
      db
        .selectFrom("EventChangeLog as cl")
        .leftJoin("Users as u", "cl.changed_by_user_uuid", "u.id")
        .select([
          "cl.id as id",
          "cl.action_type as action_type",
          "cl.field_name as field_name",
          "cl.prev_value as prev_value",
          "cl.next_value as next_value",
          "cl.changed_at as changed_at",
          "cl.changed_by_user_uuid as changed_by_user_uuid",
          "u.first_name as first_name",
          "u.last_name as last_name",
        ])
        .where("cl.event_uuid", "=", quoteId)
        .orderBy("cl.changed_at", "desc")
        .compile(),
    [quoteId],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<LogRow>());

  // Every payment of the event, deleted ones included: a payment row in the log names its payment by
  // id, and a deleted payment still has to be named.
  const { payments } = usePaymentHistory(quoteId);
  const paymentDetail = (log: LogRow) => getDetail(log, payments);

  const emailLogCompiled = useMemo(
    () =>
      db
        .selectFrom("EventEmailLog")
        .select(["id", "trigger", "status", "reason", "to_email", "template_id", "fired_at"])
        .where("event_uuid", "=", quoteId)
        .orderBy("fired_at", "desc")
        .compile(),
    [quoteId],
  );
  const { data: emailLogs = [] } = useTypedQuery(emailLogCompiled, expect<EmailLogRow>());

  // Fallback: show a synthetic "Quote Created" entry for quotes created before logging was added
  const createdAtCompiled = useMemo(
    () =>
      db.selectFrom("Events").select(["created_at"]).where("id", "=", quoteId).limit(1).compile(),
    [quoteId],
  );
  const { data: createdAtRows } = useTypedQuery(
    createdAtCompiled,
    expect<{ created_at: string | null }>(),
  );

  const rawLogs = data ?? [];
  const hasCreateEntry = rawLogs.some((l) => l.action_type === "create");

  const logs = useMemo(() => {
    if (hasCreateEntry || !createdAtRows?.[0]?.created_at) return rawLogs;
    const synthetic: LogRow = {
      id: `synthetic-create-${quoteId}`,
      action_type: "create",
      field_name: "event_name",
      prev_value: null,
      next_value: null,
      changed_at: createdAtRows[0].created_at,
      changed_by_user_uuid: null,
      first_name: null,
      last_name: null,
    };
    return [...rawLogs, synthetic];
  }, [rawLogs, hasCreateEntry, createdAtRows, quoteId]);

  const clientLogs = logs.filter(isClientEvent);
  const internalLogs = logs.filter((l) => !isClientEvent(l));

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-4 text-center">Loading activity log...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-gray-100">
        {(
          [
            { key: "internal", label: "Internal Activity", count: internalLogs.length },
            { key: "customer", label: "Customer Activity", count: clientLogs.length },
            { key: "emails", label: "Automatic Emails", count: emailLogs.length },
          ] as const
        ).map(({ key, label, count }) => {
          const isActive = activeSubTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveSubTab(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                isActive
                  ? "border-darkBlue text-darkBlue"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    isActive ? "bg-darkBlue/10 text-darkBlue" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Internal Activity */}
      {activeSubTab === "internal" &&
        (internalLogs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No internal activity recorded yet.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            {internalLogs.map((log) => {
              const config = ACTION_CONFIG[log.action_type ?? "update"] ?? ACTION_CONFIG.update;
              const userName =
                [log.first_name, log.last_name].filter(Boolean).join(" ") || "System";
              return (
                <button
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                  className="w-full flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-b-0 hover:bg-gray-50/80 transition text-left cursor-pointer"
                >
                  <span className="text-base mt-0.5 shrink-0">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{getTitle(log, payments)}</p>
                    {paymentDetail(log) && (
                      <p className="text-xs text-gray-400 truncate">{paymentDetail(log)}</p>
                    )}
                    {log.action_type === "update" && (log.prev_value || log.next_value) && (
                      <p className="text-xs text-gray-400 truncate">
                        {formatValue(log.prev_value)} → {formatValue(log.next_value)}
                      </p>
                    )}
                    {log.action_type === "line_item_add" && log.next_value && (
                      <p className="text-xs text-green-600 truncate">{log.next_value}</p>
                    )}
                    {log.action_type === "line_item_remove" && log.prev_value && (
                      <p className="text-xs text-red-500 truncate">{log.prev_value}</p>
                    )}
                    {log.action_type === "line_item_change" && (
                      <p className="text-xs text-gray-400 truncate">
                        {log.prev_value} → {log.next_value}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">{formatDateTime(log.changed_at)}</p>
                    <p className="text-xs text-gray-300">{userName}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ))}

      {/* Customer Activity */}
      {activeSubTab === "customer" &&
        (clientLogs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No customer activity recorded yet.
          </p>
        ) : (
          <div>
            {clientLogs.map((log) => (
              <ClientActivityRow key={log.id} log={log} />
            ))}
          </div>
        ))}

      {selectedLog && (
        <ChangeDetailModal
          log={selectedLog}
          payments={payments}
          onClose={() => setSelectedLog(null)}
        />
      )}

      {/* Automatic Emails */}
      {activeSubTab === "emails" &&
        (emailLogs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            No automated emails have fired for this event yet.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {emailLogs.map((row) => {
              const sent = row.status === "sent";
              const triggerLabel =
                getTrigger(row.trigger ?? "")?.label ?? row.trigger ?? "Unknown trigger";
              return (
                <div key={row.id} className="px-4 py-3 flex items-start gap-3">
                  <div
                    className={`mt-0.5 shrink-0 rounded-full p-1 ${
                      sent ? "bg-green-50" : "bg-red-50"
                    }`}
                  >
                    {sent ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{triggerLabel}</span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                          sent ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}
                      >
                        {sent ? "Sent" : "Failed"}
                      </span>
                    </div>
                    {row.to_email && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {row.to_email}
                      </p>
                    )}
                    {!sent && row.reason && <p className="text-xs text-red-500">{row.reason}</p>}
                    {row.template_id && (
                      <p className="text-[11px] text-gray-300">Template: {row.template_id}</p>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 shrink-0">{formatDateTime(row.fired_at)}</p>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
