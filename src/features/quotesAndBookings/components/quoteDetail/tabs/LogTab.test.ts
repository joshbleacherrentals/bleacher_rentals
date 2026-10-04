import { describe, it, expect } from "vitest";
import { FIELD_LABELS } from "../../../db/logEventChanges";
import {
  isClientEvent,
  getClientTitle,
  getTitle as logTitle,
  getDetail as logDetail,
} from "./LogTab";

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

const ACTION_CONFIG: Record<string, { label: string }> = {
  create: { label: "Created" },
  update: { label: "Updated" },
  sign: { label: "Signed" },
  send: { label: "Sent" },
  status_change: { label: "Status Changed" },
  line_item_add: { label: "Added" },
  line_item_remove: { label: "Removed" },
  line_item_change: { label: "Changed" },
};

function getTitle(row: LogRow): string {
  const config = ACTION_CONFIG[row.action_type ?? "update"] ?? ACTION_CONFIG.update;
  const fieldLabel = FIELD_LABELS[row.field_name ?? ""] ?? row.field_name ?? "";

  if (row.action_type === "create") return "Project Created";
  if (row.action_type === "sign") return "Contract Signed";
  if (row.action_type === "send") return `Quote Sent to ${row.next_value ?? "client"}`;
  if (row.action_type === "line_item_add") return "Line Item Added";
  if (row.action_type === "line_item_remove") return "Line Item Removed";
  if (row.action_type === "line_item_change") return "Line Item Changed";
  return `${config.label}: ${fieldLabel}`;
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

function makeLog(overrides: Partial<LogRow> = {}): LogRow {
  return {
    id: "log-1",
    action_type: "update",
    field_name: "event_name",
    prev_value: "Old",
    next_value: "New",
    changed_at: "2026-06-12T10:00:00Z",
    changed_by_user_uuid: "user-1",
    first_name: "John",
    last_name: "Doe",
    ...overrides,
  };
}

describe("getTitle", () => {
  it("returns 'Project Created' for create action", () => {
    expect(getTitle(makeLog({ action_type: "create" }))).toBe("Project Created");
  });

  it("returns 'Contract Signed' for sign action", () => {
    expect(getTitle(makeLog({ action_type: "sign" }))).toBe("Contract Signed");
  });

  it("returns 'Quote Sent to <email>' for send action", () => {
    expect(getTitle(makeLog({ action_type: "send", next_value: "test@example.com" }))).toBe(
      "Quote Sent to test@example.com",
    );
  });

  it("returns 'Quote Sent to client' when no next_value", () => {
    expect(getTitle(makeLog({ action_type: "send", next_value: null }))).toBe(
      "Quote Sent to client",
    );
  });

  it("returns 'Updated: Event Name' for field update", () => {
    expect(getTitle(makeLog({ action_type: "update", field_name: "event_name" }))).toBe(
      "Updated: Event Name",
    );
  });

  it("returns 'Status Changed: Status' for status_change", () => {
    expect(getTitle(makeLog({ action_type: "status_change", field_name: "event_status" }))).toBe(
      "Status Changed: Status",
    );
  });

  it("returns 'Updated: Account Manager' for AM change", () => {
    expect(getTitle(makeLog({ field_name: "created_by_user_uuid" }))).toBe(
      "Updated: Account Manager",
    );
  });

  it("returns 'Line Item Added' for line_item_add", () => {
    expect(getTitle(makeLog({ action_type: "line_item_add" }))).toBe("Line Item Added");
  });

  it("returns 'Line Item Removed' for line_item_remove", () => {
    expect(getTitle(makeLog({ action_type: "line_item_remove" }))).toBe("Line Item Removed");
  });

  it("returns 'Line Item Changed' for line_item_change", () => {
    expect(getTitle(makeLog({ action_type: "line_item_change" }))).toBe("Line Item Changed");
  });

  it("falls back to raw field_name when no label exists", () => {
    expect(getTitle(makeLog({ field_name: "custom_field" }))).toBe("Updated: custom_field");
  });

  it("falls back to empty string when field_name is null", () => {
    expect(getTitle(makeLog({ field_name: null }))).toBe("Updated: ");
  });
});

describe("isClientEvent", () => {
  it("returns true for client_* action types", () => {
    expect(isClientEvent(makeLog({ action_type: "client_page_view" }))).toBe(true);
    expect(isClientEvent(makeLog({ action_type: "client_tab_change" }))).toBe(true);
    expect(isClientEvent(makeLog({ action_type: "client_contract_signed" }))).toBe(true);
    expect(isClientEvent(makeLog({ action_type: "client_po_submitted" }))).toBe(true);
    expect(isClientEvent(makeLog({ action_type: "client_payment_started" }))).toBe(true);
    expect(isClientEvent(makeLog({ action_type: "client_language_change" }))).toBe(true);
  });

  it("returns false for internal action types", () => {
    expect(isClientEvent(makeLog({ action_type: "create" }))).toBe(false);
    expect(isClientEvent(makeLog({ action_type: "update" }))).toBe(false);
    expect(isClientEvent(makeLog({ action_type: "sign" }))).toBe(false);
    expect(isClientEvent(makeLog({ action_type: "send" }))).toBe(false);
  });

  it("returns false for null action_type", () => {
    expect(isClientEvent(makeLog({ action_type: null }))).toBe(false);
  });
});

describe("getClientTitle", () => {
  it("shows invoice number in page_view", () => {
    expect(
      getClientTitle(makeLog({ action_type: "client_page_view", next_value: "INV-2026-001" })),
    ).toBe("Viewed quote #INV-2026-001");
  });

  it("omits invoice number when next_value is null", () => {
    expect(getClientTitle(makeLog({ action_type: "client_page_view", next_value: null }))).toBe(
      "Viewed quote",
    );
  });

  it("shows destination tab in tab_change", () => {
    expect(
      getClientTitle(makeLog({ action_type: "client_tab_change", next_value: "Signed Contract" })),
    ).toBe('Navigated to "Signed Contract"');
  });

  it("shows signer name in contract_signed", () => {
    expect(
      getClientTitle(makeLog({ action_type: "client_contract_signed", next_value: "Jane Smith" })),
    ).toBe('Signed contract as "Jane Smith"');
  });

  it("contract_signed without name", () => {
    expect(
      getClientTitle(makeLog({ action_type: "client_contract_signed", next_value: null })),
    ).toBe("Signed contract");
  });

  it("shows PO number in po_submitted", () => {
    expect(
      getClientTitle(makeLog({ action_type: "client_po_submitted", next_value: "PO-999" })),
    ).toBe("Submitted PO #PO-999");
  });

  it("shows amount in payment_started", () => {
    expect(
      getClientTitle(makeLog({ action_type: "client_payment_started", next_value: "$1,500.00" })),
    ).toBe("Initiated payment of $1,500.00");
  });

  it("names a PDF download", () => {
    expect(getClientTitle(makeLog({ action_type: "client_pdf_download" }))).toBe("Downloaded PDF");
  });

  it("names a client language switch, so it is not filed as generic activity", () => {
    expect(
      getClientTitle(
        makeLog({
          action_type: "client_language_change",
          prev_value: "English",
          next_value: "French",
        }),
      ),
    ).toBe("Switched language to French");
  });

  it("returns 'Customer activity' for unknown client action type", () => {
    expect(getClientTitle(makeLog({ action_type: "client_unknown_future_action" }))).toBe(
      "Customer activity",
    );
  });
});

describe("formatValue", () => {
  it("returns '—' for null", () => {
    expect(formatValue(null)).toBe("—");
  });

  it("returns plain string as-is (e.g. resolved name)", () => {
    expect(formatValue("John Doe")).toBe("John Doe");
  });

  it("returns currency string as-is", () => {
    expect(formatValue("$5,000.00 USD")).toBe("$5,000.00 USD");
  });

  it("returns number from JSON string", () => {
    expect(formatValue("42")).toBe("42");
  });

  it("pretty-prints JSON objects", () => {
    expect(formatValue('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it("returns non-JSON strings as-is", () => {
    expect(formatValue("not json {")).toBe("not json {");
  });
});

// ── Payment rows (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §3, §6.3) ──
//
// The tests above exercise a copy of `getTitle`; these call the real one, because what matters here
// is what LogTab does with a row whose field_name is `payment:<id>`.

const PAYMENT = {
  id: "11111111-2222-3333-4444-555555555555",
  amountCents: 12000,
  currency: "USD",
  paidAt: new Date("2026-08-14T12:00:00").toISOString(),
  createdAt: new Date("2026-08-14T15:30:00").toISOString(),
  paymentMethodType: "ach",
  entrySource: "manual" as const,
  installmentId: null,
  payerName: "Riverside High",
  reference: null,
  notes: null,
};

const paymentRow = (over: Partial<LogRow>): LogRow => ({
  id: "log-1",
  action_type: "payment_edit",
  field_name: `payment:${PAYMENT.id}`,
  prev_value: "Amount $100.00 · Method Check",
  next_value: "Amount $120.00 · Method ACH Payment",
  changed_at: "2026-08-15T10:00:00Z",
  changed_by_user_uuid: "user-1",
  first_name: "Sam",
  last_name: "Admin",
  ...over,
});

describe("payment rows — getTitle", () => {
  it("names an edited payment by what it is, resolved from payment:<id>", () => {
    expect(logTitle(paymentRow({}), [PAYMENT])).toBe(
      "Payment edited: $120.00 · ACH Payment · Aug 14, 2026",
    );
  });

  it("names a deleted payment the same way", () => {
    expect(
      logTitle(paymentRow({ action_type: "payment_delete", next_value: null }), [PAYMENT]),
    ).toBe("Payment deleted: $120.00 · ACH Payment · Aug 14, 2026");
  });

  it("falls back to a short id when the payment is not among the event's payments", () => {
    expect(logTitle(paymentRow({}), [])).toBe("Payment edited: Payment 11111111");
  });

  it("falls back to plain Payment when the field name carries no id", () => {
    expect(logTitle(paymentRow({ field_name: "payment" }), [PAYMENT])).toBe(
      "Payment edited: Payment",
    );
  });

  it("never prints the raw payment:<id> field name", () => {
    expect(logTitle(paymentRow({}), [])).not.toContain("payment:");
    expect(logTitle(paymentRow({}), [PAYMENT])).not.toContain(PAYMENT.id);
  });

  it("leaves every other row exactly as it was", () => {
    expect(
      logTitle({ ...paymentRow({}), action_type: "update", field_name: "event_name" }, []),
    ).toBe("Updated: Event Name");
    expect(logTitle({ ...paymentRow({}), action_type: "sign", field_name: "signature" }, [])).toBe(
      "Contract Signed",
    );
  });
});

describe("payment rows — getDetail", () => {
  it("shows an edit as the previous text and the next text", () => {
    expect(logDetail(paymentRow({}), [PAYMENT])).toBe(
      "Amount $100.00 · Method Check → Amount $120.00 · Method ACH Payment",
    );
  });

  it("shows a deletion as the description of the payment, when the title does not already say it", () => {
    const row = paymentRow({
      action_type: "payment_delete",
      prev_value: "$120.00 · ACH Payment · Aug 14, 2026",
      next_value: null,
    });
    // Found among the payments: the title already carries the description, so nothing repeats it.
    expect(logDetail(row, [PAYMENT])).toBeNull();
    // Not found: the title is only a short id, and the row's own description is all there is.
    expect(logDetail(row, [])).toBe("$120.00 · ACH Payment · Aug 14, 2026");
  });

  it("S4: a deletion row shows no reason — it never carries one", () => {
    const row = paymentRow({
      action_type: "payment_delete",
      prev_value: "$120.00 · ACH Payment · Aug 14, 2026",
      next_value: null,
    });
    expect(`${logTitle(row, [])} ${logDetail(row, [])}`).not.toMatch(/reason/i);
  });

  it("has nothing to add for the rows it does not draw itself", () => {
    expect(logDetail({ ...paymentRow({}), action_type: "sign" }, [])).toBeNull();
  });
});
