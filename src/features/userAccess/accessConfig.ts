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
      "/accountant",
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
    // docs/specs/accountant-work-trackers.md: the Work Trackers pages (every week, every driver,
    // the payment modal, read-only work tracker details). docs/specs/accountant-quotes-02: the
    // Accountant page (AR and AR Deposits). docs/specs/accountant-quotes-04: Quotes & Bookings,
    // read-only — the prefix also reaches /new and /{id}/edit, which guard themselves by
    // capability. docs/specs/accountant-quotes-11: /messages, the internal chat — the prefix also
    // reaches /messages/external, a placeholder the sidebar does not offer them (D4). Plus the two
    // pages every role may read. Not /all-work-trackers or
    // /work-tracker-types. With no /dashboard, defaultRedirect falls through
    // to the first path here, so /accountant must stay first. This must not be empty:
    // useAccessRedirect would bounce a user with no allowed path forever (the driver's [] is safe
    // only because a driver-only user is blocked before this config is read).
    allowedPaths: [
      "/accountant",
      "/quotes-bookings",
      "/work-trackers",
      "/messages",
      "/permissions",
      "/changelog",
    ],
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

/**
 * Whether these roles may open `pathname`, matched the way `useAccessRedirect` matches it (by
 * path prefix). For UI that links somewhere: a link whose destination would bounce the user
 * straight back out is a button that does nothing, so it is not shown.
 */
export function canAccessPath(roles: WebRole[], pathname: string): boolean {
  return mergeRoleConfigs(roles).allowedPaths.some((p) => pathname.startsWith(p));
}
