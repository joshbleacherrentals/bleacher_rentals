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
