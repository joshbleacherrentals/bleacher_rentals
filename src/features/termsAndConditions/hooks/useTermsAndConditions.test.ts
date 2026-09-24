import { describe, it, expect, vi } from "vitest";

// The hook module reaches for the PowerSync db at import time; the pure helpers under test do not.
vi.mock("@/components/providers/SystemProvider", () => ({ db: {}, powerSyncDb: {} }));

import { findDefaultId, toItem, type Row } from "./useTermsAndConditions";

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "abc-123",
    name: "Standard Agreement",
    html_content: "<p>Terms here</p>",
    created_at: "2026-06-10T12:00:00Z",
    deleted: 0,
    is_default: 0,
    ...overrides,
  };
}

describe("toItem", () => {
  it("maps a full row to an item", () => {
    expect(toItem(row())).toEqual({
      id: "abc-123",
      name: "Standard Agreement",
      htmlContent: "<p>Terms here</p>",
      createdAt: "2026-06-10T12:00:00Z",
      isDefault: false,
    });
  });

  it("handles null fields with defaults", () => {
    expect(
      toItem(
        row({ id: "abc-456", name: null, html_content: null, created_at: null, deleted: null }),
      ),
    ).toEqual({
      id: "abc-456",
      name: "",
      htmlContent: "",
      createdAt: "",
      isDefault: false,
    });
  });

  it("preserves HTML content as-is", () => {
    const html = "<h1>Title</h1><p>Bold <strong>text</strong></p><ul><li>Item</li></ul>";
    expect(toItem(row({ html_content: html })).htmlContent).toBe(html);
  });

  it("reads the default flag, which PowerSync stores as 0/1", () => {
    expect(toItem(row({ is_default: 1 })).isDefault).toBe(true);
    expect(toItem(row({ is_default: null })).isDefault).toBe(false);
  });
});

describe("findDefaultId", () => {
  it("returns the id of the template marked default", () => {
    const items = [
      toItem(row({ id: "t-1" })),
      toItem(row({ id: "t-2", is_default: 1 })),
      toItem(row({ id: "t-3" })),
    ];

    expect(findDefaultId(items)).toBe("t-2");
  });

  it("returns null when nothing is marked", () => {
    expect(findDefaultId([toItem(row({ id: "t-1" }))])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(findDefaultId([])).toBeNull();
  });
});
