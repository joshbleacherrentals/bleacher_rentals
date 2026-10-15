"use client";

import { useMemo } from "react";
import type { Kysely } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

/**
 * Who signed the contract, for the Signed banner on the Contract tab. Read from the local
 * `ContractSignatures` table, so the banner appears when a client signs and goes when an edit
 * invalidates the signature, without a reload. Spec: docs/specs/quote-detail-02-contract-signature.md.
 */

type SignatureRow = { id: string; signer_name: string | null; signed_at: string | null };

/**
 * The event's active signature, the newest one if there are two. An invalidated signature is
 * history, not a signature. The Kysely instance is a parameter so a test can run the query on a
 * real SQLite without the PowerSync database.
 */
export function buildContractSignatureQuery(database: Kysely<PowerSyncDB>, eventId: string) {
  return database
    .selectFrom("ContractSignatures")
    .select(["id", "signer_name", "signed_at"])
    .where("event_uuid", "=", eventId)
    .where("status", "=", "active")
    .orderBy("signed_at", "desc")
    .limit(1)
    .compile();
}

export type ContractSignature = { signerName: string; signedAt: string };

/**
 * `hasTerms` is whether the quote has a contract template attached. The old
 * `GET /api/contracts/:id` answered `signature: null` for a quote without one, whatever rows
 * existed, so the banner stays hidden for it too.
 */
export function useContractSignature(
  eventId: string,
  hasTerms: boolean,
): { signature: ContractSignature | null; isLoading: boolean } {
  const query = useMemo(() => buildContractSignatureQuery(db, eventId), [eventId]);
  const { data, isLoading } = useTypedQuery(query, expect<SignatureRow>());

  const row = data?.[0];
  const signature =
    hasTerms && row
      ? // Both columns are required on the server; a row that arrived without them still draws.
        { signerName: row.signer_name ?? "", signedAt: row.signed_at ?? "" }
      : null;

  return { signature, isLoading };
}
