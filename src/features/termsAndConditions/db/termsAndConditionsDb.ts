import { db, powerSyncDb } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/**
 * Contract templates, read and written local-first.
 *
 * Every mutation here goes to the local PowerSync DB, so the page reflects it immediately and it
 * survives being offline; PowerSync uploads it. Values Postgres would have defaulted (id,
 * created_at) are set here, because a local insert never reaches those defaults.
 *
 * `recompute_quote_hashes_terms` still fires server-side when an update lands, so a quote's
 * content hash is recomputed on upload rather than at the moment of the click.
 */

export type TermsAndConditionsRow = {
  id: string;
  name: string;
  html_content: string;
  created_at: string;
  deleted: number;
};

export async function fetchAllTermsAndConditions(): Promise<TermsAndConditionsRow[]> {
  const compiled = db
    .selectFrom("TermsAndConditions")
    .select(["id", "name", "html_content", "created_at", "deleted"])
    .where("deleted", "=", 0)
    .orderBy("created_at", "desc")
    .compile();

  return powerSyncDb.getAll<TermsAndConditionsRow>(compiled.sql, compiled.parameters as any[]);
}

export async function fetchTermsAndConditionsById(
  id: string,
): Promise<TermsAndConditionsRow | null> {
  const compiled = db
    .selectFrom("TermsAndConditions")
    .select(["id", "name", "html_content", "created_at", "deleted"])
    .where("id", "=", id)
    .compile();

  const rows = await powerSyncDb.getAll<TermsAndConditionsRow>(
    compiled.sql,
    compiled.parameters as any[],
  );
  return rows[0] ?? null;
}

export async function createTermsAndConditions(params: {
  name: string;
  htmlContent: string;
}): Promise<string> {
  const id = crypto.randomUUID();

  await typedExecute(
    db
      .insertInto("TermsAndConditions")
      .values({
        id,
        name: params.name,
        html_content: params.htmlContent,
        created_at: new Date().toISOString(),
        deleted: 0,
        is_default: 0,
      })
      .compile(),
  );

  return id;
}

export async function updateTermsAndConditions(
  id: string,
  params: { name: string; htmlContent: string },
): Promise<void> {
  await typedExecute(
    db
      .updateTable("TermsAndConditions")
      .set({ name: params.name, html_content: params.htmlContent })
      .where("id", "=", id)
      .compile(),
  );
}

export async function softDeleteTermsAndConditions(id: string): Promise<void> {
  // Deleting the default frees the slot: the server's partial unique index ignores deleted rows.
  await typedExecute(
    db
      .updateTable("TermsAndConditions")
      .set({ deleted: 1, is_default: 0 })
      .where("id", "=", id)
      .compile(),
  );
}

/**
 * Makes one template the default, or clears the default entirely with `id = null`.
 *
 * Written to the local PowerSync DB so the page updates immediately and the change survives being
 * offline; PowerSync uploads it. The rest of this file still writes straight to Supabase, which is
 * why those actions only appear once the server answers.
 *
 * Clear first, then set: the server has a partial unique index allowing one default row, and the
 * two statements upload in this order. Booleans are 0/1 locally.
 */
export async function setDefaultTermsAndConditions(id: string | null): Promise<void> {
  await typedExecute(
    db
      .updateTable("TermsAndConditions")
      .set({ is_default: 0 })
      .where("is_default", "=", 1)
      .compile(),
  );

  if (!id) return;

  await typedExecute(
    db.updateTable("TermsAndConditions").set({ is_default: 1 }).where("id", "=", id).compile(),
  );
}
