"use client";

import { useMemo } from "react";
import type { Kysely } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

/**
 * Where the PDF of the event's signed contract is stored, for the Open PDF button of the invoice
 * page. Read from the local `ContractSignatures` table, which already syncs to the accountant and
 * the admin. docs/specs/accountant-collections-15-open-pdf.md §3.
 */

type SignedPdfRow = { signed_pdf_path: string | null };

/**
 * The event's active signature, the newest one if there are two: an edit of the quote invalidates
 * the signature, and then what was signed is no longer the quote. An empty path is returned as it
 * is, not skipped for an older signature's: the newest signature is the one that counts. The
 * Kysely instance is a parameter so a test can run the query on a real SQLite.
 */
export function buildSignedPdfQuery(database: Kysely<PowerSyncDB>, eventId: string) {
  return database
    .selectFrom("ContractSignatures")
    .select(["signed_pdf_path"])
    .where("event_uuid", "=", eventId)
    .where("status", "=", "active")
    .orderBy("signed_at", "desc")
    .limit(1)
    .compile();
}

export function useSignedPdf(eventId: string): {
  signedPdfPath: string | null;
  isLoading: boolean;
} {
  const query = useMemo(() => buildSignedPdfQuery(db, eventId), [eventId]);
  const { data, isLoading } = useTypedQuery(query, expect<SignedPdfRow>());

  return { signedPdfPath: data?.[0]?.signed_pdf_path ?? null, isLoading };
}
