import { test, expect } from "@playwright/test";
import {
  bigPdfFile,
  pngFile,
  seedRepairs,
  zipFile,
  type SeededRepairs,
} from "./helpers/repairsFixtures";
import {
  FILES_TIMEOUT,
  addFileButton,
  deleteDialog,
  discardDialog,
  draftFiles,
  fileRowsOf,
  filesSection,
  objectNameOf,
  objectNamesOf,
  openFilesRepair,
  pickFiles,
  storedFiles,
} from "./helpers/filesFlow";
import {
  UPLOAD_TIMEOUT,
  addService,
  newRepairWindow,
  newServiceWindow,
  repairIdsOnBleacher,
} from "./helpers/linksFlow";
import { bleacherQuery, openRepairsPage, repairRows } from "./helpers/repairsPage";

/**
 * The files of a repair, as an administrator sees them: Add file and the bin in the view mode (they
 * write at once), the draft of Edit and of New repair (written at Save), Cancel and Discard that
 * leave the bucket alone, and the files the page refuses. Written, not run (project rule); the admin
 * project cannot run locally. Every scenario reads the rows of `MaintenancePhotos` and the objects of
 * the bucket with the service role.
 * Spec: docs/specs/repairs-09b3-files.md §6 (S43 to S48, D206).
 */
test.describe.configure({ mode: "serial" });

/** Where the page uploads a file: held for a moment in S43 so that "Uploading..." can be seen. */
const UPLOAD_ROUTE = "**/storage/v1/object/maintenance-photos/**";

test.describe("Repairs: the files of a repair (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S43: Add file in the view mode takes several files at once and writes them at once", async ({
    page,
  }) => {
    const repair = seeded.files.add;
    const win = await openFilesRepair(page, seeded, repair);
    await expect(storedFiles(win)).toHaveCount(1);
    await expect(storedFiles(win).first()).toContainText("Photo 1");
    // Add file is there because the list has loaded (D201).
    await expect(addFileButton(win)).toBeVisible();

    // Hold the uploads for a moment, so that the busy state is on the screen long enough to see.
    await page.route(UPLOAD_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.continue();
    });
    await pickFiles(win, [pngFile("first.png"), pngFile("second.png")]);
    await expect(addFileButton(win)).toContainText("Uploading...");
    await expect(addFileButton(win)).toBeDisabled();
    await expect(win.getByTestId("repair-file-delete").first()).toBeDisabled();
    await page.unroute(UPLOAD_ROUTE);

    // The list is read again and names the files by their order, each with an open link.
    await expect(storedFiles(win)).toHaveCount(3, { timeout: FILES_TIMEOUT });
    for (const index of [0, 1, 2]) {
      await expect(storedFiles(win).nth(index)).toContainText(`Photo ${index + 1}`);
    }
    await expect(win.getByRole("link", { name: "Open Photo 3" })).toHaveAttribute(
      "href",
      /maintenance-photos\/.*\.png$/,
    );
    await expect(addFileButton(win)).toContainText("Add file");

    // Two rows and two objects were added, and nothing says "saved" (09a D140).
    await expect.poll(async () => (await fileRowsOf(repair.id)).length).toBe(3);
    await expect.poll(async () => (await objectNamesOf(repair.id)).length).toBe(3);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  });

  test("S44: deleting a stored file asks first, deletes its row and its object, and renames the rest; a deleted repair has no buttons", async ({
    page,
  }) => {
    const repair = seeded.files.remove;
    const [, second] = repair.files;
    const win = await openFilesRepair(page, seeded, repair);
    await expect(storedFiles(win)).toHaveCount(2);
    await expect(storedFiles(win).nth(0)).toContainText("Photo 1");
    await expect(storedFiles(win).nth(1)).toContainText("Photo 2");

    // The bin of Photo 1 opens the dialog of D202; Cancel changes nothing.
    await storedFiles(win).nth(0).getByTestId("repair-file-delete").click();
    const dialog = deleteDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Are you absolutely sure?");
    await expect(dialog).toContainText(
      "This removes Photo 1 from the repair. It cannot be undone in the app.",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(storedFiles(win)).toHaveCount(2);
    expect((await fileRowsOf(repair.id)).length).toBe(2);

    // Continue deletes the row and then the object; the other photo is now Photo 1 (D202).
    await storedFiles(win).nth(0).getByTestId("repair-file-delete").click();
    await deleteDialog(page).getByRole("button", { name: "Continue" }).click();
    await expect(deleteDialog(page)).toHaveCount(0, { timeout: 30_000 });
    await expect(storedFiles(win)).toHaveCount(1, { timeout: 30_000 });
    await expect(storedFiles(win).first()).toContainText("Photo 1");
    await expect
      .poll(async () => (await fileRowsOf(repair.id)).map((row) => row.id))
      .toEqual([second.id]);
    await expect.poll(() => objectNamesOf(repair.id)).toEqual([objectNameOf(second.path)]);

    // A deleted repair lists its files and has no Add file and no bin (D201).
    const deleted = await openFilesRepair(
      page,
      seeded,
      seeded.files.deleted,
      "&tab=completed&showDeleted=1",
    );
    await expect(storedFiles(deleted)).toHaveCount(1);
    await expect(deleted.getByTestId("repair-file-add")).toHaveCount(0);
    await expect(deleted.getByTestId("repair-file-input")).toHaveCount(0);
    await expect(deleted.getByTestId("repair-file-delete")).toHaveCount(0);
  });

  test("S45: Edit keeps a draft of files and writes it at Save", async ({ page }) => {
    const repair = seeded.files.edit;
    const [removed, kept] = repair.files;
    const win = await openFilesRepair(page, seeded, repair);
    await expect(storedFiles(win)).toHaveCount(2);

    await win.getByTestId("repair-edit").click();
    await expect(win.getByTestId("repair-save")).toBeVisible();

    // Pick a file: the draft row shows the name on the disk and its size, has no open link and a bin
    // with no dialog (D200).
    await pickFiles(win, [pngFile("new-photo.png")]);
    await expect(draftFiles(win)).toHaveCount(1);
    const draft = draftFiles(win).first();
    await expect(draft).toContainText("new-photo.png");
    await expect(draft).toContainText(/\d+ B/);
    await expect(draft.locator("a")).toHaveCount(0);
    await expect(draft.getByTestId("repair-file-draft-remove")).toBeVisible();

    // Remove a stored file through the dialog, whose text says it goes at Save (D202): it leaves the
    // list at once and the next photo is renamed.
    await storedFiles(win).nth(0).getByTestId("repair-file-delete").click();
    await expect(deleteDialog(page)).toContainText(
      "Photo 1 will be removed from the repair when you save.",
    );
    await deleteDialog(page).getByRole("button", { name: "Continue" }).click();
    await expect(deleteDialog(page)).toHaveCount(0);
    await expect(storedFiles(win)).toHaveCount(1);
    await expect(storedFiles(win).first()).toContainText("Photo 1");

    // Nothing has been written yet: the bucket and the table are as the fixture left them (D192).
    expect((await fileRowsOf(repair.id)).length).toBe(2);
    expect((await objectNamesOf(repair.id)).length).toBe(2);

    // Save writes the new file first and then the deletion (D204), and the window goes back to the
    // view mode with the stored names (D200).
    await win.getByTestId("repair-save").click();
    await expect(win.getByTestId("repair-edit")).toBeVisible({ timeout: FILES_TIMEOUT });
    await expect(draftFiles(win)).toHaveCount(0);
    await expect(storedFiles(win)).toHaveCount(2, { timeout: 30_000 });
    await expect(storedFiles(win).nth(0)).toContainText("Photo 1");
    await expect(storedFiles(win).nth(1)).toContainText("Photo 2");

    await expect
      .poll(
        async () => {
          const rows = await fileRowsOf(repair.id);
          return {
            count: rows.length,
            keptStays: rows.some((row) => row.id === kept.id),
            removedGone: !rows.some((row) => row.id === removed.id),
          };
        },
        { timeout: UPLOAD_TIMEOUT },
      )
      .toEqual({ count: 2, keptStays: true, removedGone: true });
    await expect
      .poll(async () => {
        const names = await objectNamesOf(repair.id);
        return {
          count: names.length,
          removedGone: !names.includes(objectNameOf(removed.path)),
          keptStays: names.includes(objectNameOf(kept.path)),
        };
      })
      .toEqual({ count: 2, removedGone: true, keptStays: true });
    // No message of success (09a D140).
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  });

  test("S46: Cancel and Discard leave the bucket alone", async ({ page }) => {
    const repair = seeded.files.cancel;
    const stored = objectNameOf(repair.files[0].path);
    const win = await openFilesRepair(page, seeded, repair);
    await expect(storedFiles(win)).toHaveCount(1);

    // Cancel drops the draft at once, with no question.
    await win.getByTestId("repair-edit").click();
    await pickFiles(win, [pngFile("never-saved.png")]);
    await expect(draftFiles(win)).toHaveCount(1);
    await win.getByTestId("repair-cancel").click();
    await expect(win.getByTestId("repair-edit")).toBeVisible();
    await expect(draftFiles(win)).toHaveCount(0);
    await expect(storedFiles(win)).toHaveCount(1);
    await page.waitForTimeout(3_000);
    expect(await objectNamesOf(repair.id)).toEqual([stored]);
    expect((await fileRowsOf(repair.id)).length).toBe(1);

    // The cross asks "Discard changes?" because a file was picked (D191); Discard drops the draft.
    await win.getByTestId("repair-edit").click();
    await pickFiles(win, [pngFile("also-never-saved.png")]);
    await expect(draftFiles(win)).toHaveCount(1);
    await win.getByRole("button", { name: "Close" }).click();
    await expect(discardDialog(page)).toBeVisible();
    await discardDialog(page).getByRole("button", { name: "Discard" }).click();
    await expect(discardDialog(page)).toHaveCount(0);
    await expect(win.getByTestId("repair-edit")).toBeVisible();
    await expect(draftFiles(win)).toHaveCount(0);
    await page.waitForTimeout(3_000);
    expect(await objectNamesOf(repair.id)).toEqual([stored]);
    expect((await fileRowsOf(repair.id)).length).toBe(1);
  });

  test("S47: a New repair with a file saves the repair, and then writes the file for it", async ({
    page,
  }) => {
    const bleacher = seeded.files.newRepairBleacher;
    await openRepairsPage(page, bleacherQuery(bleacher.uuid));
    await expect(page.getByTestId("repairs-empty")).toBeVisible({ timeout: 60_000 });

    await page.getByTestId("new-repair").click();
    const win = newRepairWindow(page);
    await expect(win).toBeVisible();
    await win.locator("#repair-from").fill("2026-10-20");
    await win.locator("#repair-to").fill("2026-10-25");
    await win.getByTestId("add-service").click();
    await addService(page, bleacher.number);
    await expect(newServiceWindow(page)).toHaveCount(0);

    // New repair has a Files section after the services, always with Add file (D201).
    await expect(filesSection(win)).toContainText("No files.");
    await expect(addFileButton(win)).toBeVisible();
    await pickFiles(win, [pngFile("new-repair-photo.png")]);
    await expect(draftFiles(win)).toHaveCount(1);
    await expect(draftFiles(win).first()).toContainText("new-repair-photo.png");

    // Add repair writes the repair locally, waits until the server has it (up to 10 s) and then
    // uploads the file (D193, D194); the window closes.
    await win.getByTestId("repair-save").click();
    await expect(win).toHaveCount(0, { timeout: FILES_TIMEOUT });
    await expect(repairRows(page)).toHaveCount(1, { timeout: 60_000 });

    await expect
      .poll(async () => (await repairIdsOnBleacher(bleacher.uuid)).length, {
        timeout: UPLOAD_TIMEOUT,
      })
      .toBe(1);
    const [repairId] = await repairIdsOnBleacher(bleacher.uuid);
    await expect
      .poll(async () => (await fileRowsOf(repairId)).length, { timeout: UPLOAD_TIMEOUT })
      .toBe(1);
    await expect
      .poll(async () => (await objectNamesOf(repairId)).length, { timeout: UPLOAD_TIMEOUT })
      .toBe(1);
    const [row] = await fileRowsOf(repairId);
    expect(row.photo_path.startsWith(`${repairId}/`)).toBe(true);
    expect(row.photo_path.endsWith(".png")).toBe(true);
  });

  test("S48: files the page refuses get a red toast, and the good one still joins", async ({
    page,
  }) => {
    const repair = seeded.files.none;
    const win = await openFilesRepair(page, seeded, repair);
    await expect(filesSection(win)).toContainText("No files.");

    // View mode: the two bad files are named with their reasons, the PNG is written at once (D197).
    await pickFiles(win, [bigPdfFile("big.pdf"), zipFile("notes.zip"), pngFile("ok.png")]);
    await expect(page.getByText("Some files were not added.").first()).toBeVisible();
    await expect(page.getByText("big.pdf: larger than 10 MB.").first()).toBeVisible();
    await expect(
      page.getByText("notes.zip: this type of file is not allowed.").first(),
    ).toBeVisible();
    await expect(storedFiles(win)).toHaveCount(1, { timeout: FILES_TIMEOUT });
    await expect(storedFiles(win).first()).toContainText("Photo 1");
    await expect.poll(async () => (await fileRowsOf(repair.id)).length).toBe(1);
    await expect.poll(async () => (await objectNamesOf(repair.id)).length).toBe(1);

    // Edit: the same refusal, and the PNG joins the draft; Cancel then writes nothing.
    await win.getByTestId("repair-edit").click();
    await pickFiles(win, [
      bigPdfFile("big-again.pdf"),
      zipFile("again.zip"),
      pngFile("second.png"),
    ]);
    await expect(page.getByText("big-again.pdf: larger than 10 MB.").first()).toBeVisible();
    await expect(
      page.getByText("again.zip: this type of file is not allowed.").first(),
    ).toBeVisible();
    await expect(draftFiles(win)).toHaveCount(1);
    await expect(draftFiles(win).first()).toContainText("second.png");
    await win.getByTestId("repair-cancel").click();
    await expect(draftFiles(win)).toHaveCount(0);
    await page.waitForTimeout(3_000);
    expect((await fileRowsOf(repair.id)).length).toBe(1);
    expect((await objectNamesOf(repair.id)).length).toBe(1);
  });
});
