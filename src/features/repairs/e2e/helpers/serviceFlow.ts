import { expect, type Page } from "@playwright/test";
import type { SeededRepairs } from "./repairsFixtures";
import {
  bleacherQuery,
  openRepairsPage,
  rowWith,
  serviceRows,
  toggleOf,
  windowOf,
} from "./repairsPage";

/**
 * What every role that opens the Repairs page can do with a repair and its services, read-only:
 * open the block, open a service, read the repair strip and the bleacher card, open the damage
 * report. Shared by scenario S27 of the three role specs.
 * docs/specs/repairs-06-expanded-row.md §6 and docs/specs/repairs-07-repair-window.md §6.
 */
export async function readServicesAndReport(page: Page, seeded: SeededRepairs) {
  await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
  const done = rowWith(page, seeded.completed.invoice);
  await expect(done).toBeVisible({ timeout: 60_000 });

  // A click on the row opens its block.
  await done.click();
  await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
  await expect(serviceRows(page)).toHaveCount(2);

  // A click on a service row opens the service window.
  await serviceRows(page).filter({ hasText: "Tires" }).click();
  const service = windowOf(page, "service");
  await expect(service).toBeVisible();
  const strip = service.getByTestId("service-window-repair");
  await expect(strip).toContainText(seeded.vendorName);
  await expect(strip).toContainText(seeded.completed.invoice);
  await expect(service.getByTestId("service-window-bleacher")).toContainText(
    seeded.bleacherA.modelNumber,
  );
  // Opened from the table the window has Open repair (spec 07 D98); nothing that writes.
  await expect(service.getByRole("button", { name: /Edit|Delete|Add service/ })).toHaveCount(0);
  await expect(service.getByTestId("service-window-open-repair")).toBeVisible();

  // The damage report opens over it and shows the note.
  await service.getByTestId("service-window-reports").click();
  await expect(windowOf(page, "reports")).toContainText(seeded.reportNote);
}
