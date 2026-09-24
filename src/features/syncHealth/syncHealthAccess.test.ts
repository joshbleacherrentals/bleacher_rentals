/**
 * Who may open /dev-tools/sync-health.
 *
 * The page is developer-only. The route guard (`mergeRoleConfigs` +
 * `useAccessRedirect`) matches by path PREFIX, and admins and viewers already
 * hold "/dev-tools" — so the guard alone lets them through. The page's own
 * gate is what turns them away, and it is tested here next to the guard so
 * both halves of the rule are pinned in one place:
 *
 *  * a developer passes the route guard and the page gate, and sees the link;
 *  * every other role is either stopped by the guard or redirected by the page,
 *    and never sees the link;
 *  * nothing is decided while access is still loading.
 *
 * Only the page is restricted, not the numbers: a bucket count is not
 * sensitive, and office roles already receive it on their Drivers rows. What
 * the sync rules add is the developer's own copy, because a developer with no
 * office role syncs no Drivers rows at all.
 */

import { describe, it, expect } from "vitest";
import { mergeRoleConfigs } from "@/features/userAccess/accessConfig";
import { useSidebarItems } from "@/components/sidebar/useSidebarItems";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";
import { SYNC_HEALTH_PATH } from "./constants";
import { syncHealthGate } from "./logic/syncHealthGate";

const guardAllows = (roles: WebRole[]) =>
  mergeRoleConfigs(roles).allowedPaths.some((p) => SYNC_HEALTH_PATH.startsWith(p));

const active = (roles: WebRole[]) =>
  ({ status: "active", roles, userId: "u1", accountManagerId: null }) as const;

const sidebarHrefs = (roles: WebRole[]) =>
  useSidebarItems(roles).flatMap((item) =>
    item.type === "button"
      ? [item.href]
      : item.children.map((child) => ("href" in child ? child.href : "")),
  );

describe("access to /dev-tools/sync-health", () => {
  it("lives at /dev-tools/sync-health", () => {
    expect(SYNC_HEALTH_PATH).toBe("/dev-tools/sync-health");
  });

  it("a developer passes the route guard", () => {
    expect(guardAllows(["developer"])).toBe(true);
  });

  it("a developer is not handed the rest of /dev-tools", () => {
    // stripe-checkout, damage-photos, qbo-get-sales-tax stay admin/viewer only.
    expect(mergeRoleConfigs(["developer"]).allowedPaths).not.toContain("/dev-tools");
  });

  it("a developer passes the page gate", () => {
    expect(syncHealthGate(active(["developer"]))).toBe("allowed");
  });

  it("a developer who also holds an office role passes the page gate", () => {
    expect(syncHealthGate(active(["admin", "developer"]))).toBe("allowed");
  });

  it.each(["admin", "account_manager", "viewer", "maintainer", "driver"] as const)(
    "%s without the developer role is redirected by the page",
    (role) => {
      expect(syncHealthGate(active([role]))).toBe("redirect");
    },
  );

  it.each(["account_manager", "maintainer", "driver"] as const)(
    "%s is already stopped by the route guard",
    (role) => {
      expect(guardAllows([role])).toBe(false);
    },
  );

  it("decides nothing while access is loading", () => {
    expect(syncHealthGate({ status: "loading" })).toBe("loading");
  });

  it("redirects a blocked user", () => {
    expect(syncHealthGate({ status: "blocked", reason: "no-roles-assigned" })).toBe("redirect");
  });
});

describe("the Sync Health link in the sidebar", () => {
  it("is shown to a developer", () => {
    expect(sidebarHrefs(["developer"])).toContain(SYNC_HEALTH_PATH);
  });

  it.each(["admin", "account_manager", "viewer", "maintainer", "driver"] as const)(
    "is not shown to %s",
    (role) => {
      expect(sidebarHrefs([role])).not.toContain(SYNC_HEALTH_PATH);
    },
  );
});
