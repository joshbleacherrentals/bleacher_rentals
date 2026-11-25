import { test, expect } from "@playwright/test";
import { PAGER_REPAIRS, seedRepairs, usd, type SeededRepairs } from "./helpers/repairsFixtures";
import {
  bleacherQuery,
  cellOf,
  columnHeader,
  filterButton,
  filterList,
  legacyBleacherQuery,
  openRepairsPage,
  repairRows,
  rowWith,
  searchBox,
  sortButton,
  tab,
  toggleOption,
} from "./helpers/repairsPage";

/**
 * The toolbar of the Repairs page as an administrator uses it: the search box, the four filters,
 * sorting from the headers and Show Deleted in the address. Written, not run (project rule); the
 * admin project cannot run locally.
 * Spec: docs/specs/repairs-05-toolbar.md §6 (S11 to S19, S57).
 */
test.describe.configure({ mode: "serial" });

test.describe("Repairs toolbar (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S11: the search finds a repair by the five things it reads and by nothing else", async ({
    page,
  }) => {
    const { bleacherA, completed, vendorName } = seeded;
    await openRepairsPage(page, bleacherQuery(bleacherA.uuid, "&tab=completed"));
    const box = searchBox(page);
    await expect(rowWith(page, completed.invoice)).toHaveCount(1, { timeout: 60_000 });

    // The invoice number, the vendor, the notes, the bleacher as #N and as a bare number.
    for (const needle of [
      completed.invoice,
      vendorName,
      completed.notes,
      `#${bleacherA.number}`,
      `${bleacherA.number}`,
      "Welding",
    ]) {
      await box.fill(needle);
      await expect(repairRows(page), needle).toHaveCount(1);
      await expect(rowWith(page, completed.invoice), needle).toHaveCount(1);
    }

    // No difference of case, and any part of a field.
    await box.fill(vendorName.toUpperCase());
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);
    await box.fill(vendorName.slice(4, 12));
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);

    // A text that would need two fields finds nothing (D58).
    await box.fill(`${vendorName} ${completed.invoice}`);
    await expect(page.getByTestId("repairs-empty")).toContainText("No repairs found.");

    // The category of the CAD repair is Tires only, so Welding does not find it on Open.
    await tab(page, "Open").click();
    await box.fill("Welding");
    await expect(page.getByTestId("repairs-empty")).toBeVisible();
    await box.fill("Tires");
    await expect(rowWith(page, "In repair")).toHaveCount(1);
  });

  test("S12: the search writes ?q= after a pause, clears with the cross and Esc, and goes to page 1", async ({
    page,
  }) => {
    const { bleacherB } = seeded;
    await openRepairsPage(page, bleacherQuery(bleacherB.uuid, "&tab=completed&page=2"));
    await expect(repairRows(page)).toHaveCount(PAGER_REPAIRS - 25, { timeout: 60_000 });

    const box = searchBox(page);
    await box.fill(`${bleacherB.number}`);
    await expect(page).toHaveURL(/q=/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(repairRows(page)).toHaveCount(25);
    await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText(
      `1–25 of ${PAGER_REPAIRS}`,
    );

    await page.reload();
    await expect(box).toHaveValue(`${bleacherB.number}`);

    await page.getByTestId("repairs-search-clear").click();
    await expect(box).toHaveValue("");
    await expect(page).not.toHaveURL(/q=/);

    await box.fill("something");
    await expect(page).toHaveURL(/q=something/);
    await box.press("Escape");
    await expect(box).toHaveValue("");
    await expect(page).not.toHaveURL(/q=/);
    await expect(page.getByTestId("repairs-search-clear")).toHaveCount(0);
  });

  test("S13: the Bleacher filter keeps the ticked bleachers, shows a badge and still reads the old link", async ({
    page,
  }) => {
    const { bleacherA, bleacherB, completed } = seeded;
    await openRepairsPage(page, "?tab=completed");
    await toggleOption(page, "bleacher", `#${bleacherA.number}`);
    await expect(page).toHaveURL(new RegExp(`bleachers=${bleacherA.uuid}`));
    await expect(repairRows(page)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);

    await toggleOption(page, "bleacher", `#${bleacherB.number}`);
    await expect(filterButton(page, "bleacher")).toContainText("2");
    await expect(page).toHaveURL(new RegExp(`bleachers=${bleacherA.uuid}(%2C|,)${bleacherB.uuid}`));
    await expect(repairRows(page)).toHaveCount(25);
    await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText(
      `1–25 of ${PAGER_REPAIRS + 1}`,
    );

    await filterButton(page, "bleacher").click();
    await filterList(page, "bleacher").getByText("Clear", { exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/bleachers=/);
    await expect(filterButton(page, "bleacher")).not.toContainText("2");

    // The link of spec 04: one bleacher, ticked; the first change writes the new parameter.
    await openRepairsPage(page, legacyBleacherQuery(bleacherA.uuid, "&tab=completed"));
    await expect(filterButton(page, "bleacher")).toContainText("1");
    await expect(rowWith(page, completed.invoice)).toHaveCount(1, { timeout: 60_000 });
    await tab(page, "Open").click();
    await expect(page).toHaveURL(new RegExp(`bleachers=${bleacherA.uuid}`));
    await expect(page).not.toHaveURL(/bleacher_uuid=/);
  });

  test("S14: the Zone and Vendor filters keep the repairs they name, with no entry for none", async ({
    page,
  }) => {
    const { bleacherA, bleacherB, zones, completed, vendorName } = seeded;

    await openRepairsPage(page, bleacherQuery([bleacherA.uuid, bleacherB.uuid], "&tab=completed"));
    await expect(repairRows(page)).toHaveCount(25, { timeout: 60_000 });
    if (zones) {
      await toggleOption(page, "zone", zones.a.name);
      await expect(page).toHaveURL(new RegExp(`zones=${zones.a.uuid}`));
      await expect(repairRows(page)).toHaveCount(1);
      await expect(rowWith(page, completed.invoice)).toHaveCount(1);
      await toggleOption(page, "zone", zones.b.name);
      await expect(filterButton(page, "zone")).toContainText("2");
      await expect(repairRows(page)).toHaveCount(25);
      await toggleOption(page, "zone", zones.a.name);
      await toggleOption(page, "zone", zones.b.name);
      await expect(page).not.toHaveURL(/zones=/);
    }

    // Vendor: the seeded vendor is listed, nothing says "No vendor" or "No zone" (D62).
    await filterButton(page, "vendor").click();
    await expect(
      filterList(page, "vendor").getByRole("menuitemcheckbox", { name: vendorName, exact: true }),
    ).toHaveCount(1);
    await expect(filterList(page, "vendor").getByText("No vendor")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await filterButton(page, "zone").click();
    await expect(filterList(page, "zone").getByText("No zone")).toHaveCount(0);
    await page.keyboard.press("Escape");

    await toggleOption(page, "vendor", vendorName);
    await expect(page).toHaveURL(new RegExp(`vendors=${seeded.vendorUuid}`));
    await expect(repairRows(page)).toHaveCount(1);
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);

    // The CAD repair has no vendor, so it leaves the Open tab.
    await tab(page, "Open").click();
    await expect(page.getByTestId("repairs-empty")).toBeVisible();
  });

  test("S15: the Category filter, two filters together, and the strip following them", async ({
    page,
  }) => {
    const { bleacherA, completed, vendorName } = seeded;
    await openRepairsPage(page, bleacherQuery(bleacherA.uuid, "&tab=completed"));
    await expect(rowWith(page, completed.invoice)).toHaveCount(1, { timeout: 60_000 });

    await toggleOption(page, "category", "Welding");
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);
    await toggleOption(page, "category", "Tires");
    await expect(filterButton(page, "category")).toContainText("2");
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);
    await expect(page.getByTestId("repairs-strip-usd")).toHaveText(usd(completed.totalCents));

    // Open: Tires finds the CAD repair, Welding alone does not.
    await tab(page, "Open").click();
    await expect(rowWith(page, "In repair")).toHaveCount(1);
    await toggleOption(page, "category", "Tires");
    await expect(page.getByTestId("repairs-empty")).toBeVisible();
    await expect(page.getByTestId("repairs-strip-cad")).toHaveText("C$0.00");
    await toggleOption(page, "category", "Welding");
    await toggleOption(page, "category", "Tires");
    await expect(rowWith(page, "In repair")).toHaveCount(1);
    await expect(page.getByTestId("repairs-strip-cad")).not.toHaveText("C$0.00");

    // Vendor and category together: the CAD repair has no vendor, so it does not pass both.
    await toggleOption(page, "vendor", vendorName);
    await expect(page.getByTestId("repairs-empty")).toBeVisible();
  });

  test("S16: a chosen value the list does not have stays ticked as Unknown", async ({ page }) => {
    await openRepairsPage(page, "?tab=completed&vendors=00000000-0000-4000-8000-000000000001");
    await expect(filterButton(page, "vendor")).toContainText("1");
    await expect(page.getByTestId("repairs-empty")).toContainText("No repairs found.", {
      timeout: 60_000,
    });

    await filterButton(page, "vendor").click();
    const unknown = filterList(page, "vendor").getByRole("menuitemcheckbox", {
      name: "Unknown",
      exact: true,
    });
    await expect(unknown).toHaveAttribute("aria-checked", "true");
    await unknown.click();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/vendors=/);
    await expect(repairRows(page).first()).toBeVisible({ timeout: 60_000 });
  });

  test("S17: a header click sorts, writes sort=, keeps empty values lowest and survives a tab switch", async ({
    page,
  }) => {
    const { bleacherA, bleacherB, vendorName } = seeded;

    // Total: the 26 cheap repairs cost 1000 + i cents, so the order is exact.
    await openRepairsPage(page, bleacherQuery(bleacherB.uuid, "&tab=completed&page=2"));
    await expect(repairRows(page)).toHaveCount(PAGER_REPAIRS - 25, { timeout: 60_000 });
    await sortButton(page, "Total").click();
    await expect(page).toHaveURL(/sort=total(%3A|:)desc/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(columnHeader(page, "Total")).toHaveAttribute("aria-sort", "descending");
    await expect(cellOf(repairRows(page).first(), "total")).toHaveText(
      usd(1000 + PAGER_REPAIRS - 1),
    );
    await sortButton(page, "Total").click();
    await expect(page).toHaveURL(/sort=total(%3A|:)asc/);
    await expect(columnHeader(page, "Total")).toHaveAttribute("aria-sort", "ascending");
    await expect(cellOf(repairRows(page).first(), "total")).toHaveText(usd(1000));

    // Vendor: ascending puts the 26 repairs without a vendor first, descending puts them last.
    await openRepairsPage(page, bleacherQuery([bleacherA.uuid, bleacherB.uuid], "&tab=completed"));
    await expect(repairRows(page)).toHaveCount(25, { timeout: 60_000 });
    await sortButton(page, "Vendor").click();
    await expect(page).toHaveURL(/sort=vendor(%3A|:)asc/);
    await expect(cellOf(repairRows(page).first(), "vendor")).toHaveText("—");
    await sortButton(page, "Vendor").click();
    await expect(page).toHaveURL(/sort=vendor(%3A|:)desc/);
    await expect(cellOf(repairRows(page).first(), "vendor")).toHaveText(vendorName);

    // The sort stays when the tab is switched.
    await tab(page, "Open").click();
    await expect(page).toHaveURL(/sort=vendor(%3A|:)desc/);
    await expect(columnHeader(page, "Vendor")).toHaveAttribute("aria-sort", "descending");
  });

  test("S18: ?showDeleted=1 shows the deleted repair, with its caption, and the button toggles it", async ({
    page,
  }) => {
    const { bleacherA, completed, deleted } = seeded;
    await openRepairsPage(page, bleacherQuery(bleacherA.uuid, "&tab=completed&showDeleted=1"));
    await expect(rowWith(page, deleted.invoice)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowWith(page, completed.invoice)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Showing Deleted" })).toBeVisible();
    await expect(page.getByText("Deleted completed repairs that match the filters")).toBeVisible();

    await tab(page, "Open").click();
    await expect(page.getByText("Deleted open repairs that match the filters")).toBeVisible();
    await expect(page).toHaveURL(/showDeleted=1/);

    // The search applies to the deleted repairs too.
    await tab(page, "Completed").click();
    await searchBox(page).fill("no-such-text-anywhere");
    await expect(page.getByTestId("repairs-empty")).toBeVisible();
    await searchBox(page).fill(deleted.invoice);
    await expect(rowWith(page, deleted.invoice)).toHaveCount(1);

    await page.getByRole("button", { name: "Showing Deleted" }).click();
    await expect(page).not.toHaveURL(/showDeleted=/);
    await searchBox(page).fill("");
    await expect(rowWith(page, completed.invoice)).toHaveCount(1);
    await expect(page.getByText("Completed repairs that match the filters")).toBeVisible();
  });

  test("S19: a search or a filter that finds nothing reads No repairs found. and 0–0 of 0", async ({
    page,
  }) => {
    await openRepairsPage(page, "?tab=completed&q=zzzz-no-repair-has-this");
    await expect(page.getByTestId("repairs-empty")).toContainText("No repairs found.", {
      timeout: 60_000,
    });
    await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText("0–0 of 0");
    await expect(page.getByTestId("repairs-strip-usd")).toHaveText("$0.00");
    await expect(page.getByTestId("repairs-strip-cad")).toHaveText("C$0.00");
  });

  test("S57: Clear All Filters shows only while a filter is ticked and empties all four, nothing else", async ({
    page,
  }) => {
    const { bleacherA, completed, vendorName } = seeded;
    const clear = page.getByTestId("repairs-clear-filters");
    await openRepairsPage(page, "?tab=completed");
    await expect(clear).toHaveCount(0);

    // A search text alone is not a filter.
    await searchBox(page).fill(completed.invoice);
    await expect(rowWith(page, completed.invoice)).toHaveCount(1, { timeout: 60_000 });
    await expect(clear).toHaveCount(0);

    // Two filters: the button appears, and one click empties both.
    await toggleOption(page, "bleacher", `#${bleacherA.number}`);
    await toggleOption(page, "vendor", vendorName);
    await expect(clear).toBeVisible();
    await expect(clear).toHaveText("Clear All Filters");
    await expect(page).toHaveURL(/bleachers=/);
    await expect(page).toHaveURL(/vendors=/);
    await clear.click();
    await expect(clear).toHaveCount(0);
    await expect(page).not.toHaveURL(/bleachers=|zones=|vendors=|categories=|page=/);
    await expect(filterButton(page, "bleacher")).not.toContainText("1");
    await expect(filterButton(page, "vendor")).not.toContainText("1");

    // The search and the tab stay.
    await expect(searchBox(page)).toHaveValue(completed.invoice);
    await expect(page).toHaveURL(/q=/);
    await expect(page).toHaveURL(/tab=completed/);
  });
});
