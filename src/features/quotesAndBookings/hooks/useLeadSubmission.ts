"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { leadSubmissionSections, type SubmissionSection } from "../utils/leadSubmissionView";

type Row = { lead_submission: string | null };

/**
 * The website form submission a quote was created from, read from the local database. `sections`
 * is null when the quote has none (it was made in the app), so the page can hide the tab.
 */
export function useLeadSubmission(eventId: string): {
  sections: SubmissionSection[] | null;
  isLoading: boolean;
} {
  const compiled = useMemo(
    () => db.selectFrom("Events").select(["lead_submission"]).where("id", "=", eventId).compile(),
    [eventId],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());
  const sections = useMemo(() => leadSubmissionSections(data?.[0]?.lead_submission), [data]);
  return { sections, isLoading };
}
