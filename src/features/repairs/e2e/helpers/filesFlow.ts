import { expect, type Locator, type Page } from "@playwright/test";
import {
  FILES_BUCKET,
  serviceRoleClient,
  type FilePayload,
  type FilesRepair,
  type SeededRepairs,
} from "./repairsFixtures";
import { bleacherQuery, openButtonOf, openRepairsPage, rowWith, windowOf } from "./repairsPage";

/**
 * What the 09b3 scenarios (S43 to S50) do in the Files section of the repair window and read from
 * the database and the bucket: open a repair's window, pick files on the hidden input, and read the
 * rows of `MaintenancePhotos` and the objects of the bucket with the service role. The page writes
 * the files straight to Supabase (spec 07 D99, spec 09b3 D192), so the reads poll only for the
 * moment a Save has to wait for its repair (D193). docs/specs/repairs-09b3-files.md §6.
 */

/** A Save with files waits up to 10 s for its repair (D193), then uploads: poll a little longer. */
export const FILES_TIMEOUT = 60_000;

export const filesSection = (win: Locator) => win.getByTestId("repair-files");
/** The rows of the stored files. */
export const storedFiles = (win: Locator) => filesSection(win).getByTestId("repair-file");
/** The rows of the files picked in the draft of Edit or New repair (D200). */
export const draftFiles = (win: Locator) => filesSection(win).getByTestId("repair-file-draft");
export const addFileButton = (win: Locator) => filesSection(win).getByTestId("repair-file-add");
export const deleteDialog = (page: Page) => page.getByTestId("repair-file-delete-dialog");
export const discardDialog = (page: Page) => page.getByTestId("repair-discard-dialog");

/** Picks files on the hidden input of the section, as the system picker would (D198). */
export async function pickFiles(win: Locator, files: FilePayload[]) {
  await filesSection(win).getByTestId("repair-file-input").setInputFiles(files);
}

/** The list has stopped saying "Loading..." (it shows rows, "No files." or an error). */
export async function waitForFilesLoaded(win: Locator) {
  await expect(filesSection(win)).toBeVisible({ timeout: 30_000 });
  await expect(filesSection(win)).not.toContainText("Loading...", { timeout: 30_000 });
}

/** Opens the window of a repair of the files fixtures (on the Open tab unless `extra` says otherwise). */
export async function openFilesRepair(
  page: Page,
  seeded: SeededRepairs,
  repair: FilesRepair,
  extra = "",
) {
  await openRepairsPage(page, bleacherQuery(seeded.files.bleacher.uuid, extra));
  const row = rowWith(page, repair.invoice);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await openButtonOf(row).click();
  const win = windowOf(page, "repair");
  await expect(win).toBeVisible();
  await waitForFilesLoaded(win);
  return win;
}

/** The rows of `MaintenancePhotos` of a repair, read with the service role. */
export async function fileRowsOf(
  repairId: string,
): Promise<{ id: string; photo_path: string; created_at: string }[]> {
  const res = await serviceRoleClient()
    .from("MaintenancePhotos")
    .select("id, photo_path, created_at")
    .eq("maintenance_event_uuid", repairId)
    .order("created_at", { ascending: true });
  if (res.error) throw new Error(`file rows read failed: ${res.error.message}`);
  return (res.data ?? []) as { id: string; photo_path: string; created_at: string }[];
}

/** The names of the objects in the folder of a repair in the bucket (`<repair id>/<name>`). */
export async function objectNamesOf(repairId: string): Promise<string[]> {
  const res = await serviceRoleClient().storage.from(FILES_BUCKET).list(repairId);
  if (res.error) throw new Error(`bucket read failed: ${res.error.message}`);
  return (res.data ?? []).map((object) => object.name).sort();
}

/** The part of a stored path after the folder: the name of its object. */
export const objectNameOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * What the account manager can do with the files of a repair: read them, open them, and nothing
 * else (D201, spec 07 D102 for the viewer). Shared with S33 of that role's spec.
 * docs/specs/repairs-09b3-files.md §6 (S49).
 */
export async function readFilesWithoutButtons(page: Page, seeded: SeededRepairs) {
  await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
  const done = rowWith(page, seeded.completed.invoice);
  await expect(done).toBeVisible({ timeout: 60_000 });
  await openButtonOf(done).click();
  const win = windowOf(page, "repair");
  await expect(win).toBeVisible();

  await expect(storedFiles(win)).toHaveCount(2, { timeout: 30_000 });
  for (const [index, name] of ["Photo 1", "PDF 1"].entries()) {
    await expect(storedFiles(win).nth(index)).toContainText(name);
    await expect(win.getByRole("link", { name: `Open ${name}` })).toHaveAttribute(
      "href",
      /maintenance-photos/,
    );
  }

  await expect(win.getByTestId("repair-file-add")).toHaveCount(0);
  await expect(win.getByTestId("repair-file-input")).toHaveCount(0);
  await expect(win.getByTestId("repair-file-delete")).toHaveCount(0);
  await expect(win.getByTestId("repair-edit")).toHaveCount(0);
}
