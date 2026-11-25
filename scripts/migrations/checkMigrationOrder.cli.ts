/**
 * CI gate for supabase/migrations, run on every PR:
 *
 * 1. Every migration this branch adds must sort after the newest migration in production. Production
 *    is `main` (production.yaml runs `supabase db push` on every push to it).
 * 2. No migration already on a deployed branch (develop, staging, main) may be edited or deleted:
 *    it has already run on that database and will not run again.
 *
 * Usage: tsx scripts/migrations/checkMigrationOrder.cli.ts
 *
 * Assumes the deployed branches have been fetched (`git fetch origin develop staging main`).
 * Compares committed files (HEAD), not the working tree.
 */
import { execFileSync } from "node:child_process";
import {
  checkMigrationOrder,
  checkMigrationsUnchanged,
  type MigrationBlob,
} from "../../src/lib/migrations/checkMigrationOrder";

const DIR = "supabase/migrations";
const PRODUCTION = "main";
const DEPLOYED = ["develop", "staging", "main"];

/** The migrations on a ref, with their content hashes. Null when the ref is not there. */
function migrationsOn(ref: string): MigrationBlob[] | null {
  let out: string;
  try {
    out = execFileSync("git", ["ls-tree", ref, `${DIR}/`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  // "<mode> blob <hash>\t<path>"
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [meta, file] = line.split("\t");
      return { file, hash: meta.split(" ")[2] };
    });
}

const branch = migrationsOn("HEAD") ?? [];
const failures: string[] = [];

const production = migrationsOn(`origin/${PRODUCTION}`);
if (!production) {
  console.error(`Could not list ${DIR} on origin/${PRODUCTION}. Is the branch fetched?`);
  process.exit(2);
}

const order = checkMigrationOrder({
  branchFiles: branch.map((b) => b.file),
  productionFiles: production.map((b) => b.file),
});
if (!order.ok) {
  failures.push(
    `New migrations dated before the newest one in production (origin/${PRODUCTION}: ${order.latestInProduction}), so they would run out of order:`,
    ...order.outOfOrder.map((f) => `    - ${f}`),
    `  Rename each to a timestamp after it, e.g.`,
    `    git mv ${DIR}/<old> ${DIR}/$(date -u +%Y%m%d%H%M%S)_<name>.sql`,
  );
}

const deployed = DEPLOYED.flatMap((name) => {
  const files = migrationsOn(`origin/${name}`);
  if (!files) console.warn(`  (origin/${name} not fetched; skipping it)`);
  return files ? [{ branch: name, files }] : [];
});
const changed = checkMigrationsUnchanged({ branch, deployed });
if (changed.length > 0) {
  if (failures.length) failures.push("");
  failures.push(
    `Migrations already on a deployed branch were changed. They have already run there and will not run again; put the change in a new migration instead:`,
    ...changed.map((c) => `    - ${c.file}: ${c.change} (on ${c.branch})`),
    `  Restore each with: git checkout origin/<branch> -- ${DIR}/<file>`,
  );
}

if (failures.length > 0) {
  console.error(`\n✖ Migration check failed\n`);
  for (const line of failures) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

console.log(
  `✔ Migration check passed — ${order.ok ? order.added.length : 0} new migration(s) after production's newest; none on ${DEPLOYED.join(", ")} changed`,
);
