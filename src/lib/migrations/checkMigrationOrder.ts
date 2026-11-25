/** A migration's version: the timestamp before the first underscore of its file name. */
export function migrationVersion(file: string): string {
  const name = file.split("/").pop() ?? file;
  return name.split("_")[0];
}

export type MigrationOrderResult =
  | { ok: true; added: string[] }
  | { ok: false; latestInProduction: string; outOfOrder: string[] };

/**
 * A new migration must sort after every migration already in production. `supabase db push` runs
 * migrations in file-name order and refuses (or, with --include-all, runs out of order) a local
 * migration older than the newest one on the database, so a PR that adds one would break the
 * production deploy. Pure: takes the file names on this branch and on production (main).
 */
export function checkMigrationOrder(input: {
  branchFiles: string[];
  productionFiles: string[];
}): MigrationOrderResult {
  const isSql = (f: string) => f.endsWith(".sql");
  const name = (f: string) => f.split("/").pop() ?? f;
  const production = new Set(input.productionFiles.filter(isSql).map(name));
  const added = input.branchFiles
    .filter(isSql)
    .map(name)
    .filter((f) => !production.has(f))
    .sort();
  const latestInProduction = [...production].sort().at(-1);
  if (!latestInProduction) return { ok: true, added };

  const latest = migrationVersion(latestInProduction);
  const outOfOrder = added.filter((f) => migrationVersion(f) <= latest);
  return outOfOrder.length === 0
    ? { ok: true, added }
    : { ok: false, latestInProduction, outOfOrder };
}

/** A migration file as git sees it: its name and the hash of its contents. */
export type MigrationBlob = { file: string; hash: string };

export type ChangedMigration = { file: string; branch: string; change: "modified" | "deleted" };

/**
 * A migration that has reached a deployed branch (develop, staging or main) has already run on that
 * database, and `supabase db push` never runs it again: editing it changes nothing there and makes
 * the databases drift, and deleting it leaves a version on the database with no file. So every
 * migration on a deployed branch must be on this branch too, byte for byte. Pure.
 */
export function checkMigrationsUnchanged(input: {
  branch: MigrationBlob[];
  deployed: { branch: string; files: MigrationBlob[] }[];
}): ChangedMigration[] {
  const name = (f: string) => f.split("/").pop() ?? f;
  const here = new Map(input.branch.map((b) => [name(b.file), b.hash]));
  const changed: ChangedMigration[] = [];
  for (const { branch, files } of input.deployed) {
    for (const f of files) {
      if (!f.file.endsWith(".sql")) continue;
      const hash = here.get(name(f.file));
      if (hash === undefined) changed.push({ file: name(f.file), branch, change: "deleted" });
      else if (hash !== f.hash) changed.push({ file: name(f.file), branch, change: "modified" });
    }
  }
  return changed;
}
