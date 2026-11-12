import { errorMessage } from "@/features/quotesAndBookings/utils/eventFileUpload";

/**
 * The click on a row of the Files table: the file opens in a new tab and the invoice page keeps
 * its state. The blank tab is opened first, in the click itself, because a tab opened after an
 * `await` can be blocked by the browser. It is cut off from this page, then pointed at a fresh
 * signed link. On an error the blank tab is closed and a message is shown. Never throws.
 * The same shape as `openSignedPdf` (spec 15), with the wording of a file.
 * docs/specs/accountant-collections-21-files-row-click.md §1 and §3.
 */

export type TabHandle = { opener: unknown; location: { href: string }; close: () => void };

export async function openFileInNewTab({
  openTab,
  createUrl,
  showError,
}: {
  /** Opens the blank tab; null when the browser blocked it. Called before anything is awaited. */
  openTab: () => TabHandle | null;
  createUrl: () => Promise<string>;
  showError: (lines: string[]) => void;
}): Promise<void> {
  const tab = openTab();
  if (!tab) {
    showError([
      "Could not open the file",
      "The browser blocked the new tab. Allow pop-ups for this site and try again.",
    ]);
    return;
  }
  tab.opener = null;
  try {
    tab.location.href = await createUrl();
  } catch (err) {
    tab.close();
    showError(["Could not open the file", errorMessage(err)]);
  }
}
