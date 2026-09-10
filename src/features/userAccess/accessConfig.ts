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
    allowedPaths: ["/roadmap", "/changelog", "/driver-satisfaction"],
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
    // The annual inspection queue is the whole of this role's job. /permissions
    // so they can read what they are allowed to do, and /changelog so a release
    // note is not invisible to them; without a dashboard, defaultRedirect falls
    // through to the first path here, which is the queue.
    allowedPaths: ["/annual-inspections", "/permissions", "/changelog", "/assets"],
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
