import { NEW_QUOTE_CLIENT_NOTES } from "./newQuoteNotes";

/**
 * What an empty new-quote form should start with: the starter notes, and the default contract
 * template when one is marked (docs/specs/default-terms-template.md).
 *
 * Only fields that are still empty are returned, so nothing the user typed, chose or deliberately
 * cleared is overwritten — which also makes this safe to re-run as the default template arrives
 * from PowerSync, rather than needing to fire exactly once at the right moment.
 *
 * `openedOverADraft` is read when the page opens, before the unsaved-changes baseline is re-taken:
 * a draft already in progress is left exactly as the user left it.
 */
export function newQuoteFieldsToPrefill(params: {
  editingEventId: string | null;
  openedOverADraft: boolean;
  currentNotes: string;
  currentTermsId: string | null;
  defaultTermsId: string | null;
}): { clientFacingNotes?: string; termsDocumentId?: string } {
  if (params.editingEventId || params.openedOverADraft) return {};

  return {
    ...(params.currentNotes ? {} : { clientFacingNotes: NEW_QUOTE_CLIENT_NOTES }),
    ...(params.defaultTermsId && !params.currentTermsId
      ? { termsDocumentId: params.defaultTermsId }
      : {}),
  };
}
