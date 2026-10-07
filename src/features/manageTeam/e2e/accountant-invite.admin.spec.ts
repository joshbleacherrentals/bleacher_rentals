import { test, expect } from "@playwright/test";
import { makeGmailPlusAlias } from "./utils/gmail";
import { deleteUserByEmail } from "./helpers/accountantFixtures";

/**
 * Granting the Accountant role from /team (docs/specs/accountant-role.md, S1 and S2).
 *
 * The invite is a real Clerk invitation, so — like invite-email.spec.ts — it is addressed to a
 * plus-alias of the inbox in E2E_GMAIL_INBOX and the test skips without one. The user it creates
 * is deleted afterwards (the role row cascades) and the pending invitation is revoked.
 */
const gmailBaseInbox = process.env.E2E_GMAIL_INBOX;

test.describe("Accountant role — invited from /team (admin)", () => {
  test.skip(!gmailBaseInbox, "Missing E2E_GMAIL_INBOX: the invitation must go to an inbox we own");

  test("an admin can invite an accountant, see them listed, and remove the role", async ({
    page,
  }) => {
    const email = makeGmailPlusAlias(gmailBaseInbox!);

    try {
      await page.goto("/team");
      await page.getByRole("button", { name: "+ Add Team Member" }).click();

      await page.locator("#firstName").fill("E2E");
      await page.locator("#lastName").fill("Accountant");
      await page.locator("#email").fill(email);

      // Accountant is offered to an admin, and choosing it opens its (settings-free) panel.
      await page.getByRole("button", { name: "+ Add Role" }).click();
      await page.getByRole("menuitem", { name: "Accountant" }).click();
      await expect(page.getByRole("heading", { name: "Accountant" })).toBeVisible();
      await expect(page.getByText("It has no permissions yet.")).toBeVisible();

      await page.getByRole("button", { name: "Save & Send Invite" }).click();
      await expect(page.getByText("User created and invite sent")).toBeVisible({
        timeout: 60_000,
      });

      // S1: listed under the Accountants tab — and not flagged as an incomplete setup.
      await expect(page).toHaveURL(/\/team$/);
      await page.getByRole("button", { name: "Accountants", exact: true }).click();
      await expect(page.getByText(email)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Incomplete User Setup")).toHaveCount(0);

      // S2: removing the role deactivates it, and the user drops out of the tab.
      await page.getByText(email).click();
      await page.getByRole("button", { name: "Remove Accountant role" }).click();
      await page.getByRole("button", { name: "Remove Role" }).click();
      await page.getByRole("button", { name: "Save Changes" }).click();
      await expect(page.getByText("User updated successfully")).toBeVisible({ timeout: 60_000 });

      await page.getByRole("button", { name: "Accountants", exact: true }).click();
      await expect(page.getByText(email)).toHaveCount(0);
    } finally {
      await page.request.delete("/api/invite", { data: { email } }).catch(() => {});
      await deleteUserByEmail(email);
    }
  });
});
