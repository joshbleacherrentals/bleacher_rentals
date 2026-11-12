import { describe, expect, it, vi } from "vitest";
import { openFileInNewTab } from "./openFileInNewTab";

// Spec: docs/specs/accountant-collections-21-files-row-click.md §1, §3, §5 and §7. The click on a
// row of the Files table, run here with the tab, the signed-link call and the toast replaced by
// stand-ins (the same shape as the tests of `openSignedPdf`, spec 15).

const fakeTab = () => ({
  opener: { stillThere: true } as unknown,
  location: { href: "about:blank" },
  close: vi.fn(),
});

describe("openFileInNewTab", () => {
  it("opens the tab before it waits for anything, then points it at the signed link", async () => {
    const order: string[] = [];
    const tab = fakeTab();
    const createUrl = vi.fn(async () => {
      order.push("link asked");
      return "https://storage.example/signed?token=abc";
    });
    const pending = openFileInNewTab({
      openTab: () => {
        order.push("tab opened");
        return tab;
      },
      createUrl,
      showError: vi.fn(),
    });
    // Synchronously, as in the click: the browser blocks a tab opened after an await.
    expect(order).toEqual(["tab opened", "link asked"]);
    await pending;

    expect(tab.location.href).toBe("https://storage.example/signed?token=abc");
  });

  it("cuts the new tab off from the page that opened it", async () => {
    const tab = fakeTab();
    await openFileInNewTab({
      openTab: () => tab,
      createUrl: async () => "https://storage.example/signed",
      showError: vi.fn(),
    });
    expect(tab.opener).toBeNull();
  });

  it("cuts the tab off before the link is asked for, not after", async () => {
    const tab = fakeTab();
    let openerWhenAsked: unknown = "not asked";
    await openFileInNewTab({
      openTab: () => tab,
      createUrl: async () => {
        openerWhenAsked = tab.opener;
        return "https://storage.example/signed";
      },
      showError: vi.fn(),
    });
    expect(openerWhenAsked).toBeNull();
  });

  it("shows no error when it worked, and does not close the tab", async () => {
    const tab = fakeTab();
    const showError = vi.fn();
    await openFileInNewTab({
      openTab: () => tab,
      createUrl: async () => "https://storage.example/signed",
      showError,
    });
    expect(showError).not.toHaveBeenCalled();
    expect(tab.close).not.toHaveBeenCalled();
  });

  it("says so when the browser blocked the new tab, and asks for no link", async () => {
    const createUrl = vi.fn(async () => "https://storage.example/signed");
    const showError = vi.fn();
    await openFileInNewTab({ openTab: () => null, createUrl, showError });

    expect(createUrl).not.toHaveBeenCalled();
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith([
      "Could not open the file",
      "The browser blocked the new tab. Allow pop-ups for this site and try again.",
    ]);
  });

  it("closes the blank tab and shows the reason when the link cannot be made", async () => {
    const tab = fakeTab();
    const showError = vi.fn();
    await openFileInNewTab({
      openTab: () => tab,
      createUrl: async () => {
        throw { message: "Object not found" };
      },
      showError,
    });

    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe("about:blank");
    expect(showError).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(["Could not open the file", "Object not found"]);
  });

  it("closes the tab and shows the reason when there is no connection", async () => {
    const tab = fakeTab();
    const showError = vi.fn();
    await openFileInNewTab({
      openTab: () => tab,
      createUrl: async () => {
        throw new TypeError("Failed to fetch");
      },
      showError,
    });
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(showError).toHaveBeenCalledWith(["Could not open the file", "Failed to fetch"]);
  });

  it("never throws, whatever createUrl does", async () => {
    for (const thrown of [new Error("boom"), "plain text", undefined, null, 42]) {
      await expect(
        openFileInNewTab({
          openTab: () => fakeTab(),
          createUrl: async () => {
            throw thrown;
          },
          showError: vi.fn(),
        }),
      ).resolves.toBeUndefined();
    }
  });

  it("falls back to a general reason when what was thrown says nothing", async () => {
    const showError = vi.fn();
    await openFileInNewTab({
      openTab: () => fakeTab(),
      createUrl: async () => {
        throw undefined;
      },
      showError,
    });
    expect(showError).toHaveBeenCalledWith(["Could not open the file", "unknown error"]);
  });
});
