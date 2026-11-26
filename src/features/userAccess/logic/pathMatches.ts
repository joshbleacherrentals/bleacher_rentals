/**
 * Whether an address is under a path: it equals the path, or continues it after a slash.
 *
 * The one rule for every place that compares an address with an allowed path or a menu path (the
 * access check, the redirect guard and the sidebar highlight), so they always agree. A plain
 * `startsWith` is wrong here: `/dashboard` would also match `/dashboard-analytics`, and an account
 * manager, who has `/dashboard`, would open a page that is not theirs.
 *
 * `pathname` is the pathname only, never the query string or the hash. The case is compared exactly.
 * A trailing slash on the address still matches (`/repairs/` matches `/repairs`), and a path that
 * itself ends with "/" matches every address that starts with it.
 *
 * docs/specs/dashboard-analytics-02-access-shell.md §2.1.
 */
export function pathMatches(path: string, pathname: string): boolean {
  if (pathname === path) return true;
  if (path.endsWith("/")) return pathname.startsWith(path);
  return pathname.startsWith(`${path}/`);
}
