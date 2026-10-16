import type { QuoteDetail } from "../../../../db/fetchQuoteDetail";
import type { QuoteStatus } from "../../../../types/quoteTypes";
import {
  normalizeLostFields,
  validateLostReason,
  type LostReason,
} from "../../../../utils/lostReason";

/** What the Project Info block lets you change. */
export type ProjectInfoValue = {
  eventName: string;
  eventTypeId: string | null;
  status: QuoteStatus;
  lostReason: LostReason | null;
  lostReasonNote: string;
  quoteValidTill: string;
};

export function projectInfoFromQuote(quote: QuoteDetail): ProjectInfoValue {
  return {
    eventName: quote.eventName,
    eventTypeId: quote.eventTypeUuid,
    status: (quote.eventStatus as QuoteStatus | null) ?? "draft",
    lostReason: (quote.lostReason as LostReason | null) ?? null,
    lostReasonNote: quote.lostReasonNote ?? "",
    quoteValidTill: quote.quoteValidTill ?? "",
  };
}

/** The `Events` columns this block fills. */
export function projectInfoColumns(value: ProjectInfoValue): Record<string, unknown> {
  return {
    event_name: value.eventName,
    event_type_uuid: value.eventTypeId,
    event_status: value.status,
    ...normalizeLostFields(value),
    quote_valid_till: value.quoteValidTill || null,
  };
}

export function validateProjectInfo(value: ProjectInfoValue): string[] {
  const errors = validateLostReason(value);
  if (!value.eventName.trim()) errors.unshift("Event Name is required.");
  return errors;
}
