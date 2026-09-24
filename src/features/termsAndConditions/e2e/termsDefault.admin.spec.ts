import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Marking a contract template default, and a new quote starting on it —
 * docs/specs/default-terms-template.md.
 *
 * The helpers this rests on are unit tested; what only a browser shows is that the radio writes
 * through, that the list re-renders from PowerSync, and that "+ Create Quote" carries the default
 * into the Terms dropdown.
 */
test.use({ viewport: { width: 1280, height: 900 } });

// A fresh context replicates the whole PowerSync database before it can see seeded rows.
test.describe.configure({ timeout: 300_000 });

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env for e2e fixture seeding");
  return createClient(url, key, { auth: { persistSession: false } });
}

const tag = randomUUID().slice(0, 8);
const templateName = `E2E Default Template ${tag}`;
const templateId = randomUUID();

test.beforeAll(async () => {
  const supabase = adminClient();
  const { error } = await supabase.from("TermsAndConditions").insert({
    id: templateId,
    name: templateName,
    html_content: "<p>E2E terms</p>",
  });
  if (error) throw new Error(`fixture insert failed: ${error.message}`);
});

test.afterAll(async () => {
  const supabase = adminClient();
  // Clear the default first: the partial unique index is what this spec is about.
  await supabase.from("TermsAndConditions").update({ is_default: false }).eq("id", templateId);
  await supabase.from("TermsAndConditions").delete().eq("id", templateId);
});

test.describe("Default contract template (admin)", () => {
  test("marking a template default carries it into a new quote", async ({ page }) => {
    await page.goto("/terms-and-conditions");

    const row = page.getByRole("row", { name: new RegExp(templateName) });
    await expect(row).toBeVisible({ timeout: 240_000 });

    await row.getByRole("radio").check();
    await expect(row.getByText("Default", { exact: true })).toBeVisible();

    // Straight to the URL, not via "+ Create Quote": prefilling on the button meant a typed URL,
    // a refresh or a bookmark opened an empty dropdown.
    await page.goto("/quotes-bookings/new");
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 60_000 });

    // And the same through the button.
    await page.goto("/quotes-bookings");
    await page.getByRole("button", { name: "+ Create Quote" }).click();
    await expect(page).toHaveURL(/\/quotes-bookings\/new/);
    await expect(page.getByText(templateName)).toBeVisible({ timeout: 60_000 });
  });
});
