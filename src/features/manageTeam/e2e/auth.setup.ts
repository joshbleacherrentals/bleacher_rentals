import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

setup.describe.configure({ mode: "serial" });

// One authenticated storageState per role, consumed by the matching project in
// playwright.config.ts. Role users are seeded in supabase/seed.sql; credentials
// come from .env.local (E2E_*). The "user" role keeps the original file name for
// back-compat with the existing invite-email spec (chromium project).
const ROLES = [
  { role: "user", emailVar: "E2E_CLERK_EMAIL", passwordVar: "E2E_CLERK_PASSWORD" },
  { role: "admin", emailVar: "E2E_ADMIN_EMAIL", passwordVar: "E2E_ADMIN_PASSWORD" },
  { role: "am", emailVar: "E2E_AM_EMAIL", passwordVar: "E2E_AM_PASSWORD" },
  { role: "driver", emailVar: "E2E_DRIVER_EMAIL", passwordVar: "E2E_DRIVER_PASSWORD" },
  { role: "viewer", emailVar: "E2E_VIEWER_EMAIL", passwordVar: "E2E_VIEWER_PASSWORD" },
  { role: "developer", emailVar: "E2E_DEVELOPER_EMAIL", passwordVar: "E2E_DEVELOPER_PASSWORD" },
  { role: "maintainer", emailVar: "E2E_MAINTAINER_EMAIL", passwordVar: "E2E_MAINTAINER_PASSWORD" },
] as const;

const authFileFor = (role: string) => path.join(process.cwd(), `playwright/.auth/${role}.json`);

setup("clerk setup", async () => {
  // Clerk's testing helpers look for CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY.
  // Your Next.js app typically uses NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.
  if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  }

  if (!process.env.CLERK_PUBLISHABLE_KEY) {
    throw new Error(
      "Missing CLERK_PUBLISHABLE_KEY (or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) for Clerk Playwright testing",
    );
  }

  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("Missing CLERK_SECRET_KEY for Clerk Playwright testing");
  }

  await clerkSetup();
});

for (const { role, emailVar, passwordVar } of ROLES) {
  setup(`authenticate ${role}`, async ({ page }) => {
    const identifier = process.env[emailVar];
    const password = process.env[passwordVar];

    // A role with no credentials is skipped rather than failing the whole run.
    // Its project simply has no valid storageState; only run specs for roles you configured.
    setup.skip(!identifier || !password, `Missing ${emailVar} and/or ${passwordVar}`);

    const authFile = authFileFor(role);
    fs.mkdirSync(path.dirname(authFile), { recursive: true });

    await page.goto("/");

    // Password strategy avoids external OAuth (Apple) and bot detection.
    // Requires Clerk username/password auth enabled + the seeded test user.
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: identifier!,
        password: password!,
      },
    });

    await page.context().storageState({ path: authFile });
  });
}
