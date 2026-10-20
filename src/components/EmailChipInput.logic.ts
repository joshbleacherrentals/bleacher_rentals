import {
  addAddress,
  emailKey,
  findAddressField,
  splitAddressText,
  type RecipientField,
  type RecipientFields,
} from "@/features/quotesAndBookings/utils/sendQuote";

export type ContactSuggestion = { id: string; name: string; email: string };

export const MAX_SUGGESTIONS = 6;

/**
 * Contacts whose name or email contains the typed text (case-insensitive), leaving out any address
 * already in To, Cc or Bcc. An empty query suggests nothing.
 */
export function filterSuggestions(
  contacts: ContactSuggestion[],
  query: string,
  fields: RecipientFields,
  limit = MAX_SUGGESTIONS,
): ContactSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const out: ContactSuggestion[] = [];
  for (const c of contacts) {
    const email = c.email?.trim();
    if (!email) continue;
    const key = emailKey(email);
    if (seen.has(key) || findAddressField(fields, email)) continue;
    if (!email.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

export type CommitResult = {
  fields: RecipientFields;
  /** What stays in the text box: the pieces that were refused. */
  remaining: string;
  /** The first refusal, or null. */
  error: string | null;
};

/**
 * Turns typed or pasted text (one address or several, split on commas, semicolons and spaces)
 * into chips. An invalid address or one already in any field is refused and stays in the box.
 */
export function commitDraft(
  fields: RecipientFields,
  field: RecipientField,
  draft: string,
): CommitResult {
  let current = fields;
  const refused: string[] = [];
  let error: string | null = null;
  for (const token of splitAddressText(draft)) {
    const result = addAddress(current, field, token);
    if (result.ok) {
      current = result.fields;
    } else {
      refused.push(token);
      error ??= result.message;
    }
  }
  return { fields: current, remaining: refused.join(", "), error };
}

export function removeChip(
  fields: RecipientFields,
  field: RecipientField,
  email: string,
): RecipientFields {
  const key = emailKey(email);
  return { ...fields, [field]: fields[field].filter((e) => emailKey(e) !== key) };
}

export function removeLastChip(fields: RecipientFields, field: RecipientField): RecipientFields {
  return { ...fields, [field]: fields[field].slice(0, -1) };
}

/** True while the text ends inside an open quoted name ("Smith,) or an open <address. */
export function isInsideNameOrAngle(draft: string): boolean {
  const quotes = (draft.match(/"/g) ?? []).length;
  return quotes % 2 === 1 || draft.lastIndexOf("<") > draft.lastIndexOf(">");
}

/**
 * Commits the highlighted/clicked suggestion. A stored address that is malformed or already
 * present is refused: the typed text stays in the box and the error is shown.
 */
export function pickSuggestion(
  fields: RecipientFields,
  field: RecipientField,
  email: string,
  draft: string,
): CommitResult {
  // The whole stored string is one address: never split it on spaces.
  const r = addAddress(fields, field, email);
  if (!r.ok) return { fields, remaining: draft, error: r.message };
  return { fields: r.fields, remaining: "", error: null };
}

export type ChipKeyAction = "commit" | "pick" | "removeLast" | "next" | "prev" | "close" | null;

/** What a key press does in the chip input. Enter picks the highlighted suggestion when there is one. */
export function chipKeyAction(
  key: string,
  state: { draft: string; hasHighlight: boolean; listOpen: boolean },
): ChipKeyAction {
  switch (key) {
    case "Enter":
      if (state.hasHighlight) return "pick";
      return state.draft.trim() ? "commit" : null;
    case ",":
    case ";":
      // A comma inside `"Smith, John"` or `<a@b.com` belongs to the address text being typed.
      if (isInsideNameOrAngle(state.draft)) return null;
      return state.draft.trim() ? "commit" : null;
    case "Backspace":
      return state.draft === "" ? "removeLast" : null;
    case "ArrowDown":
      return state.listOpen ? "next" : null;
    case "ArrowUp":
      return state.listOpen ? "prev" : null;
    case "Escape":
      return state.listOpen ? "close" : null;
    default:
      return null;
  }
}
