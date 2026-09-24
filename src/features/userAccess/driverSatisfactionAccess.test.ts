/**
 * Who may open /driver-satisfaction.
 *
 * The page shows every driver's named, non-anonymous opinion of the app and of
 * their work. Two things therefore have to stay true, and neither is visible
 * from the page's own code:
 *
 *  * all four office roles can reach it — the sync rules give each of them its
 *    own copy of the three tables, and a role allowed to sync the data but not
 *    to open the page would be a silent dead end;
 *  * a driver cannot reach it at all. A driver reading the fleet's scores is
 *    the one disclosure this feature must not make, and `mergeRoleConfigs`
 *    UNIONS the paths of every role a user holds — so this also pins down the
 *    driver-who-is-also-something-else case, where a union could quietly hand a
 *    driver a page the driver half was never meant to see.
 */

import { describe, it, expect } from "vitest";
import { mergeRoleConfigs } from "./accessConfig";

const PATH = "/driver-satisfaction";

describe("access to /driver-satisfaction", () => {
  it.each(["admin", "account_manager", "developer", "viewer"] as const)(
    "%s can open the page",
    (role) => {
      expect(mergeRoleConfigs([role]).allowedPaths).toContain(PATH);
    },
  );

  it("a driver cannot open the page, and gets no sidebar at all", () => {
    const access = mergeRoleConfigs(["driver"]);
    expect(access.allowedPaths).not.toContain(PATH);
    expect(access.allowedPaths).toEqual([]);
    expect(access.showSidebar).toBe(false);
  });

  it("being a driver never subtracts a page an office role grants", () => {
    // The union is the intended behaviour: an admin who also drives keeps the
    // admin's access. Pinned so a future change to mergeRoleConfigs cannot
    // silently invert it in either direction.
    expect(mergeRoleConfigs(["driver", "admin"]).allowedPaths).toContain(PATH);
  });

  it("a developer's narrow access still includes this page", () => {
    // Developers see almost nothing else in the web app; the survey is one of
    // the four pages they are given, because they are its audience. (The fourth
    // is /dev-tools/sync-health, added with the Sync Health page.)
    const access = mergeRoleConfigs(["developer"]);
    expect(access.allowedPaths).toContain(PATH);
    expect(access.allowedPaths).toHaveLength(4);
  });
});
