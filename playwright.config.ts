import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Role-based projects. Each role authenticates in auth.setup.ts and stores its
// session in playwright/.auth/<role>.json. A role's specs live in files named
// *.<role>.spec.ts (e.g. dashboard.admin.spec.ts). Files without a role suffix
// run on the default `chromium` project (the original E2E_CLERK_* user).
const ROLES = ["admin", "am", "driver", "viewer", "developer", "maintainer"] as const;

// A role with no credentials gets no project. auth.setup.ts already skips the
// sign-in for one, but a project whose storageState file is missing fails at
// launch rather than skipping — so the maintainer suite stays out of the run
// until E2E_MAINTAINER_EMAIL exists, and joins it the day it does.
const CREDENTIAL_ENV: Record<(typeof ROLES)[number], string> = {
  admin: "E2E_ADMIN_EMAIL",
  am: "E2E_AM_EMAIL",
  driver: "E2E_DRIVER_EMAIL",
  viewer: "E2E_VIEWER_EMAIL",
  developer: "E2E_DEVELOPER_EMAIL",
  maintainer: "E2E_MAINTAINER_EMAIL",
};
const CONFIGURED_ROLES = ROLES.filter((role) => !!process.env[CREDENTIAL_ENV[role]]);

const roleSpec = (role: string) => new RegExp(`\\.${role}\\.spec\\.ts$`);
const anyRoleSpec = new RegExp(`\\.(${ROLES.join("|")})\\.spec\\.ts$`);

export default defineConfig({
  testDir: "src/features/manageTeam/e2e",
  timeout: 240_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "on-first-retry",
    video: process.env.CI ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      // Default user (E2E_CLERK_EMAIL). Runs every spec without a role suffix.
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: anyRoleSpec,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },
    ...CONFIGURED_ROLES.map((role) => ({
      name: role,
      dependencies: ["setup"],
      // Role specs live beside the feature they cover, not only in manageTeam/e2e.
      // The filename suffix is what assigns them to a role, so scanning all of src
      // is safe: testMatch still admits only *.<role>.spec.ts.
      testDir: "src",
      testMatch: roleSpec(role),
      use: {
        ...devices["Desktop Chrome"],
        storageState: `playwright/.auth/${role}.json`,
      },
    })),
    // Anonymous public-page tests (no auth, no setup dependency). Isolated testDir so they
    // don't collide with the authenticated manageTeam suite. See the public-quote spec.
    {
      name: "anon",
      testDir: "src/features/quotesAndBookings/e2e",
      testMatch: /\.public\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Cross-browser run for the visibility/pause behaviour. Opt-in because it needs
    // `npx playwright install firefox webkit`. See docs/specs/quote-staleness-detection.md §7.
    ...(process.env.E2E_CROSS_BROWSER
      ? [
          {
            name: "anon-firefox",
            testDir: "src/features/quotesAndBookings/e2e",
            testMatch: /\.public\.spec\.ts$/,
            use: { ...devices["Desktop Firefox"] },
          },
          {
            name: "anon-webkit",
            testDir: "src/features/quotesAndBookings/e2e",
            testMatch: /\.public\.spec\.ts$/,
            use: { ...devices["Desktop Safari"] },
          },
        ]
      : []),
  ],

  webServer:
    process.env.E2E_START_WEB === "false"
      ? undefined
      : {
          command: "npm run dev:e2e",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
});
