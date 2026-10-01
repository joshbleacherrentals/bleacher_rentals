import type { WebRole } from "./logic/determineAccess";

type RoleConfig = {
  allowedPaths: string[];
  showSidebar: boolean;
};

export type MergedAccessConfig = {
  allowedPaths: string[];
  defaultRedirect: string;
  showSidebar: boolean;
};

const ROLE_CONFIG: Record<WebRole, RoleConfig> = {
  admin: {
    allowedPaths: [
      "/dashboard",
      "/quotes-bookings",
      "/team",
      "/assets",
      "/damage-reports",
      "/inspections",
      "/annual-inspections",
      "/repairs",
      "/work-trackers",
      "/all-work-trackers",
      "/scorecard",
      "/driver-scorecard",
      "/driver-satisfaction",
      "/leaderboard",
      "/driver-calendar",
      "/zones",
      "/inspection-questions",
      "/quickbooks",
      "/work-tracker-types",
      "/event-dashboard",
      "/roadmap",
      "/permissions",
      "/dev-tools",
      "/sales-offices",
      "/storage-locations",
      "/terms-and-conditions",
      "/pricing-matrix",
      "/quote",
      "/companies-contacts",
      "/messages",
      "/stripe-connections",
      "/automatic-emails",
      "/changelog",
    ],
    showSidebar: true,
  },
  account_manager: {
    allowedPaths: [
      "/dashboard",
      "/quotes-bookings",
      "/assets",
      "/team",
      "/damage-reports",
      "/inspections",
      "/repairs",
      "/work-trackers",
      "/all-work-trackers",
      "/scorecard",
      "/driver-scorecard",
      "/driver-satisfaction",
      "/leaderboard",
      "/driver-calendar",
      "/event-dashboard",
      "/roadmap",
      "/sales-offices",
      "/permissions",
      "/quote",
      "/companies-contacts",
      "/messages",
      "/changelog",
    ],
    showSidebar: true,
  },
  developer: {
    // All of /dev-tools: the developer's Dev Tools sidebar section lists every
    // page under it. Sync Health keeps its own page gate on top of this.
    allowedPaths: ["/roadmap", "/changelog", "/driver-satisfaction", "/dev-tools"],
    showSidebar: true,
  },
  viewer: {
    allowedPaths: [
      "/dashboard",
      "/quotes-bookings",
      "/assets",
      "/team",
      "/damage-reports",
      "/inspections",
      "/annual-inspections",
      "/repairs",
      "/work-trackers",
      "/all-work-trackers",
      "/scorecard",
      "/driver-scorecard",
      "/driver-satisfaction",
      "/leaderboard",
      "/driver-calendar",
      "/roadmap",
      "/dev-tools",
      "/sales-offices",
      "/permissions",
      "/companies-contacts",
      "/changelog",
    ],
    showSidebar: true,
  },
  maintainer: {
    // The annual inspection queue is the heart of this role's job, plus damage reports and
    // repairs (docs/specs/maintainer-damage-and-maintenance.md). /permissions so they can read
    // what they are allowed to do, and /changelog so a release note is not invisible to them.
    // /dashboard so they can write notes in cells (docs/specs/maintainer-dashboard-cells.md);
    // with it, defaultRedirect lands them there, the same as every other role that has one.
    allowedPaths: [
      "/dashboard",
      "/annual-inspections",
      "/damage-reports",
      "/repairs",
      "/permissions",
      "/changelog",
      "/assets",
    ],
    showSidebar: true,
  },
  accountant: {
    // Stage 1 (docs/specs/accountant-role.md): the role has no permissions, so it gets only the two
    // pages every role may read. With no /dashboard, defaultRedirect falls through to the first path
    // here — the page that tells them what they may do. This must not be empty: useAccessRedirect
    // would bounce a user with no allowed path forever (the driver's [] is safe only because a
    // driver-only user is blocked before this config is read).
    allowedPaths: ["/permissions", "/changelog"],
    showSidebar: true,
  },
  driver: {
    allowedPaths: [],
    showSidebar: false,
  },
};

export function mergeRoleConfigs(roles: WebRole[]): MergedAccessConfig {
  const pathSet = new Set<string>();
  let showSidebar = false;

  for (const role of roles) {
    const config = ROLE_CONFIG[role];
    for (const path of config.allowedPaths) {
      pathSet.add(path);
    }
    if (config.showSidebar) showSidebar = true;
  }

  const allowedPaths = [...pathSet];
  const defaultRedirect = allowedPaths.includes("/dashboard")
    ? "/dashboard"
    : (allowedPaths[0] ?? "/");

  return { allowedPaths, defaultRedirect, showSidebar };
}
