import { describe, it, expect, vi, beforeEach } from "vitest";
import { logEventChanges, logSingleChange, logLineItemChanges, formatCentsForLog } from "./logEventChanges";

const mockInsert = vi.fn();

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === "EventChangeLog") {
      return { insert: mockInsert };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  }),
} as any;

describe("formatCentsForLog", () => {
  it("formats positive cents as USD", () => {
    expect(formatCentsForLog(150000, "USD")).toBe("$1,500.00 USD");
  });

  it("formats negative cents", () => {
    expect(formatCentsForLog(-50000, "USD")).toBe("-$500.00 USD");
  });

  it("formats zero", () => {
    expect(formatCentsForLog(0)).toBe("$0.00");
  });

  it("formats CAD", () => {
    expect(formatCentsForLog(100000, "CAD")).toBe("$1,000.00 CAD");
  });

  it("handles null", () => {
    expect(formatCentsForLog(null)).toBe("$0.00");
  });
});

describe("logEventChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("shows a tax override turning off as Yes -> No, not 1 -> 0", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { is_tax_overridden: 1 },
      { is_tax_overridden: 0 },
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        field_name: "is_tax_overridden",
        prev_value: "Yes",
        next_value: "No",
      }),
    ]);
  });

  it("logs nothing when the tax override flag did not change", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { is_tax_overridden: 0 },
      { is_tax_overridden: 0 },
    );

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a row for each changed field", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { event_name: "Old Name", event_start: "2026-01-01" },
      { event_name: "New Name", event_start: "2026-01-01" },
    );

    expect(mockSupabase.from).toHaveBeenCalledWith("EventChangeLog");
    expect(mockInsert).toHaveBeenCalledWith([
      {
        event_uuid: "event-1",
        changed_by_user_uuid: "user-1",
        field_name: "event_name",
        prev_value: "Old Name",
        next_value: "New Name",
        action_type: "update",
      },
    ]);
  });

  it("skips insert when nothing changed", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { event_name: "Same" },
      { event_name: "Same" },
    );

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("formats cents fields as currency", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { contract_revenue_cents: 500000 },
      { contract_revenue_cents: 1000000 },
      "update",
      "USD",
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        prev_value: "$5,000.00 USD",
        next_value: "$10,000.00 USD",
      }),
    ]);
  });

  it("handles null-to-value transitions", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { notes: null },
      { notes: "Added note" },
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        field_name: "notes",
        prev_value: null,
        next_value: "Added note",
      }),
    ]);
  });

  it("detects multiple changed fields", async () => {
    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { event_name: "A", event_start: "2026-01-01", event_end: "2026-01-02" },
      { event_name: "B", event_start: "2026-02-01", event_end: "2026-01-02" },
    );

    const rows = mockInsert.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows.map((r: any) => r.field_name)).toEqual(["event_name", "event_start"]);
  });

  it("logs error but does not throw on DB failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: { message: "DB error" } });

    await logEventChanges(
      mockSupabase,
      "event-1",
      "user-1",
      { event_name: "A" },
      { event_name: "B" },
    );

    expect(consoleSpy).toHaveBeenCalledWith("Failed to log event changes:", "DB error");
    consoleSpy.mockRestore();
  });
});

describe("logLineItemChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("logs added line items", async () => {
    await logLineItemChanges(
      mockSupabase,
      "event-1",
      "user-1",
      [],
      [{ label: "5-Row Bleacher", qty: 2, unitPriceCents: 50000, lineTotalCents: 100000 }],
      "USD",
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        action_type: "line_item_add",
        next_value: "5-Row Bleacher x2 @ $500.00 USD",
        prev_value: null,
      }),
    ]);
  });

  it("logs removed line items", async () => {
    await logLineItemChanges(
      mockSupabase,
      "event-1",
      "user-1",
      [{ label: "Delivery", qty: 1, unitPriceCents: 30000, lineTotalCents: 30000 }],
      [],
      "USD",
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        action_type: "line_item_remove",
        prev_value: "Delivery x1 @ $300.00 USD",
        next_value: null,
      }),
    ]);
  });

  it("logs price changes on a line item", async () => {
    await logLineItemChanges(
      mockSupabase,
      "event-1",
      "user-1",
      [{ label: "5-Row Bleacher", qty: 2, unitPriceCents: 50000, lineTotalCents: 100000 }],
      [{ label: "5-Row Bleacher", qty: 2, unitPriceCents: 60000, lineTotalCents: 120000 }],
      "USD",
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        action_type: "line_item_change",
        prev_value: "5-Row Bleacher x2 @ $500.00 USD",
        next_value: expect.stringContaining("price $500.00 USD → $600.00 USD"),
      }),
    ]);
  });

  it("logs quantity changes on a line item", async () => {
    await logLineItemChanges(
      mockSupabase,
      "event-1",
      "user-1",
      [{ label: "Setup", qty: 1, unitPriceCents: 20000, lineTotalCents: 20000 }],
      [{ label: "Setup", qty: 3, unitPriceCents: 20000, lineTotalCents: 60000 }],
      "USD",
    );

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        action_type: "line_item_change",
        next_value: expect.stringContaining("qty 1 → 3"),
      }),
    ]);
  });

  it("does nothing when line items unchanged", async () => {
    await logLineItemChanges(
      mockSupabase,
      "event-1",
      "user-1",
      [{ label: "Bleacher", qty: 1, unitPriceCents: 50000, lineTotalCents: 50000 }],
      [{ label: "Bleacher", qty: 1, unitPriceCents: 50000, lineTotalCents: 50000 }],
      "USD",
    );

    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe("logSingleChange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ error: null });
  });

  it("inserts a single change log entry", async () => {
    await logSingleChange(mockSupabase, "event-1", "user-1", "signature", null, "John Doe", "sign");

    expect(mockSupabase.from).toHaveBeenCalledWith("EventChangeLog");
    expect(mockInsert).toHaveBeenCalledWith({
      event_uuid: "event-1",
      changed_by_user_uuid: "user-1",
      field_name: "signature",
      prev_value: null,
      next_value: "John Doe",
      action_type: "sign",
    });
  });
});
