import { describe, it, expect, beforeEach, vi } from "vitest";

// The store persists via localStorage; stub it before importing the module.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
});

const { useCreateQuoteStore, hasUnsavedChanges, captureQuoteBaseline } =
  await import("./useCreateQuoteStore");

describe("hasUnsavedChanges / captureQuoteBaseline", () => {
  beforeEach(() => {
    useCreateQuoteStore.getState().resetForm();
    captureQuoteBaseline();
  });

  it("clean form is not dirty", () => {
    expect(hasUnsavedChanges()).toBe(false);
  });

  it("editing a tracked field marks dirty", () => {
    useCreateQuoteStore.getState().setField("eventName", "Birthday");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("a loaded baseline is not dirty until changed (no edit-page false positive)", () => {
    // Simulate loadQuoteIntoStore populating an existing quote, then baselining.
    useCreateQuoteStore.getState().setField("eventName", "Loaded Quote");
    useCreateQuoteStore.getState().setField("eventStart", "2026-08-01");
    captureQuoteBaseline();
    expect(hasUnsavedChanges()).toBe(false);

    useCreateQuoteStore.getState().setField("eventStart", "2026-09-01");
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("detects line item changes (deep, not just length)", () => {
    const item = { id: "a", category: "bleachers", lineTotalCents: 100 } as never;
    useCreateQuoteStore.getState().addLineItem(item);
    captureQuoteBaseline();
    expect(hasUnsavedChanges()).toBe(false);

    useCreateQuoteStore.getState().updateLineItem("a", { lineTotalCents: 200 });
    expect(hasUnsavedChanges()).toBe(true);
  });

  it("marks dirty when the status flips to lost and a reason is picked", () => {
    useCreateQuoteStore.getState().setField("status", "lost");
    expect(hasUnsavedChanges()).toBe(true);

    captureQuoteBaseline();
    useCreateQuoteStore.getState().setField("lostReason", "price_too_high");
    expect(hasUnsavedChanges()).toBe(true);

    captureQuoteBaseline();
    useCreateQuoteStore.getState().setField("lostReasonNote", "went elsewhere");
    expect(hasUnsavedChanges()).toBe(true);
  });
});

describe("resetForm", () => {
  it("clears the lost reason fields", () => {
    useCreateQuoteStore.getState().setField("status", "lost");
    useCreateQuoteStore.getState().setField("lostReason", "other");
    useCreateQuoteStore.getState().setField("lostReasonNote", "competitor");

    useCreateQuoteStore.getState().resetForm();

    expect(useCreateQuoteStore.getState().lostReason).toBeNull();
    expect(useCreateQuoteStore.getState().lostReasonNote).toBe("");
  });
});

describe("automatic payment schedules", () => {
  it("starts each fresh quote with unique 50/50 installments", () => {
    useCreateQuoteStore.getState().resetForm();
    const before = useCreateQuoteStore.getState().paymentInstallments;
    expect(before.map((i) => i.percentageBps)).toEqual([5000, 5000]);
    useCreateQuoteStore.getState().resetForm();
    expect(useCreateQuoteStore.getState().paymentInstallments[0].id).not.toBe(before[0].id);
  });
  it("follows event date until schedule is explicitly edited", () => {
    useCreateQuoteStore.getState().resetForm();
    useCreateQuoteStore.getState().setField("eventStart", "2099-08-01");
    expect(useCreateQuoteStore.getState().paymentInstallments[1].dueDate).toBe("2099-07-25");
    useCreateQuoteStore
      .getState()
      .setPaymentInstallments([{ id: "custom", dueDate: "2099-07-01", percentageBps: 10000 }]);
    useCreateQuoteStore.getState().setField("eventStart", "2099-09-01");
    expect(useCreateQuoteStore.getState().paymentInstallments[0].dueDate).toBe("2099-07-01");
  });
  it("does not recreate an explicitly removed schedule", () => {
    useCreateQuoteStore.getState().setPaymentInstallments([]);
    useCreateQuoteStore.getState().setField("eventStart", "2099-10-01");
    expect(useCreateQuoteStore.getState().paymentInstallments).toEqual([]);
  });
});

describe("saved draft upgrade", () => {
  it("converts amounts to percentages, preserving dates and IDs", async () => {
    const migrate = useCreateQuoteStore.persist.getOptions().migrate!;
    const old = {
      ...useCreateQuoteStore.getState(),
      lineItems: [{ category: "custom_service", lineTotalCents: 100000 }],
      taxPercent: 0,
      taxOverrideCents: null,
      paymentInstallments: [{ id: "saved", dueDate: "2099-01-01", amountCents: 100000 }],
    };
    const result = await migrate(old, 0);
    expect(result.paymentInstallments).toEqual([
      { id: "saved", dueDate: "2099-01-01", percentageBps: 10000 },
    ]);
    expect(JSON.parse(mem.get("create-quote-draft-before-percentages")!)).toEqual(
      JSON.parse(JSON.stringify(old)),
    );
  });
  it("preserves an unconvertible draft backup and blocks saving", async () => {
    const migrate = useCreateQuoteStore.persist.getOptions().migrate!;
    const old = {
      ...useCreateQuoteStore.getState(),
      lineItems: [],
      taxPercent: 0,
      taxOverrideCents: null,
      paymentInstallments: [{ id: "saved", dueDate: "2099-01-01", amountCents: 100000 }],
    };
    const result = await migrate(old, 0);
    expect(result.scheduleError).toContain("no quote total");
    expect(mem.get("create-quote-draft-before-percentages")).toContain('"amountCents":100000');
  });
});
