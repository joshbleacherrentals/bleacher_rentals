export type ClientNote = { label: string; text: string };

export type CompanyNoteInfo = { name: string; notes: string };

/**
 * Companies that actually have something written in their notes, by id — the only ones the
 * quote form can ever show a note for, so a long address book stays a short map.
 */
export function indexCompanyNotes(
  companies: { id: string; name: string; notes: string | null }[],
): Map<string, CompanyNoteInfo> {
  const map = new Map<string, CompanyNoteInfo>();
  for (const c of companies) {
    const notes = c.notes?.trim();
    if (notes) map.set(c.id, { name: c.name, notes });
  }
  return map;
}

/**
 * The notes an account manager should see under a picked contact on the quote form: the
 * contact's own, then the company's it belongs to. Blank ones are left out.
 */
export function clientNotesFor(
  contact: { notes: string | null; companyUuid: string | null } | null,
  companyNotes: Map<string, CompanyNoteInfo>,
): ClientNote[] {
  if (!contact) return [];

  const notes: ClientNote[] = [];

  const own = contact.notes?.trim();
  if (own) notes.push({ label: "Contact notes", text: own });

  const company = contact.companyUuid ? companyNotes.get(contact.companyUuid) : undefined;
  if (company) {
    notes.push({
      label: company.name ? `Company notes · ${company.name}` : "Company notes",
      text: company.notes,
    });
  }

  return notes;
}
