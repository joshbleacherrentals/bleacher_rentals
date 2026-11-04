// The rules behind the "To" field of a reply: who is listed, how each person is labelled, and which
// contacts to suggest while typing. Addresses are kept trimmed and in lower case, which is how they
// are compared everywhere.

/** A contact that has an email address, as the "To" field's suggestions know them. */
export type DirectoryContact = {
  id: string;
  /** "First Last", or "" when the contact has no name. */
  name: string;
  email: string;
};

const key = (address: string) => address.trim().toLowerCase();

/** "Pat Smith", "Pat" or "": whichever of the first and last name are there. */
export function contactDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName, lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

/** Each contact's name by their address in lower case. A contact with no name is left out. */
export function namesByAddress(directory: readonly DirectoryContact[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const contact of directory) {
    const address = key(contact.email);
    if (contact.name && address && !names.has(address)) names.set(address, contact.name);
  }
  return names;
}

/** What a recipient's pill says: "Pat Smith (pat@xyz.com)" for a contact, else the address alone. */
export function recipientLabel(address: string, names: ReadonlyMap<string, string>): string {
  const name = names.get(key(address));
  return name ? `${name} (${address})` : address;
}

/**
 * The folded "To" line: each recipient by their contact's name, or by their address when they are
 * not a contact, joined with commas ("Mike Timmermans, no-contact@gmail.com").
 */
export function recipientSummary(
  list: readonly string[],
  names: ReadonlyMap<string, string>,
): string {
  return list.map((address) => names.get(key(address)) ?? address).join(", ");
}

/**
 * The contacts to suggest for what has been typed: those whose address or name contains it, the
 * ones where it starts the address or a word of the name first. Anyone already chosen is left out,
 * a person with several contacts is suggested once, and nothing is suggested for an empty query.
 */
export function suggestContacts(
  directory: readonly DirectoryContact[],
  query: string,
  chosen: readonly string[],
  limit = 8,
): DirectoryContact[] {
  const wanted = key(query);
  if (!wanted) return [];

  const taken = new Set(chosen.map(key));
  const starting: DirectoryContact[] = [];
  const containing: DirectoryContact[] = [];

  for (const contact of directory) {
    const address = key(contact.email);
    if (!address || taken.has(address)) continue;

    const name = contact.name.toLowerCase();
    const starts =
      address.startsWith(wanted) ||
      name.startsWith(wanted) ||
      name.split(/\s+/).some((word) => word.startsWith(wanted));
    const contains = address.includes(wanted) || name.includes(wanted);
    if (!starts && !contains) continue;

    taken.add(address);
    (starts ? starting : containing).push(contact);
  }

  return [...starting, ...containing].slice(0, limit);
}

/** The list with `address` added, in lower case, unless it is already there. */
export function addRecipient(list: readonly string[], address: string): string[] {
  const added = key(address);
  if (!added || list.some((existing) => key(existing) === added)) return [...list];
  return [...list, added];
}

/** The list without `address`, whatever its case. */
export function removeRecipient(list: readonly string[], address: string): string[] {
  const removed = key(address);
  return list.filter((existing) => key(existing) !== removed);
}
