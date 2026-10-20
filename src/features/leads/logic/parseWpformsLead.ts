/**
 * A website lead from the WPForms form, as Make.com's HTTP module sends it. Every field is
 * optional and a lead may be almost blank, so nothing here throws: what cannot be read is null.
 *
 * Make maps its watcher's bundle into the JSON body, so the fields arrive flat, named as in the
 * form (`event_name`, `city_town`, ...). A date may be a plain string or WPForms' `{ value, unix }`.
 */

export type ParsedLead = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  eventName: string | null;
  seats: number | null;
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string | null;
  /** `YYYY-MM-DD`, or null when the lead gave no readable date. */
  startDate: string | null;
  endDate: string | null;
  /** Everything else the form said, as lines for the quote's internal notes. */
  internalNotes: string | null;
};

const text = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const isRealDate = (year: number, month: number, day: number) => {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

/** `MM/DD/YYYY` (the form's own format) or `YYYY-MM-DD`, as `YYYY-MM-DD`; null if neither. */
export function parseLeadDate(raw: unknown): string | null {
  const value =
    raw && typeof raw === "object" ? text((raw as { value?: unknown }).value) : text(raw);
  if (!value) return null;

  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const [year, month, day] = us
    ? [Number(us[3]), Number(us[1]), Number(us[2])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [0, 0, 0];
  if (!year || !isRealDate(year, month, day)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function splitName(full: string | null): { firstName: string | null; lastName: string | null } {
  if (!full) return { firstName: null, lastName: null };
  const [first, ...rest] = full.split(/\s+/);
  return { firstName: first, lastName: rest.join(" ") || null };
}

export function parseWpformsLead(body: unknown): ParsedLead {
  const f = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const { firstName, lastName } = splitName(text(f.name));
  const email = text(f.email)?.toLowerCase() ?? null;

  const seatsRaw = text(f.num_seats)?.replace(/[^\d]/g, "");
  const seats = seatsRaw ? Number(seatsRaw) : null;

  const referral = [f.referral_method, f.referral_source, f.referral_detail]
    .map(text)
    .filter(Boolean)
    .join(" / ");
  const lines = [
    "Website lead (WPForms).",
    text(f.indoor_outdoor) && `Indoor / outdoor: ${text(f.indoor_outdoor)}`,
    seats ? `Seats requested: ${seats}` : null,
    referral && `Referral: ${referral}`,
    text(f.comment) && `Comment: ${text(f.comment)}`,
  ].filter(Boolean);

  return {
    firstName,
    lastName,
    email,
    phone: text(f.phone),
    eventName: text(f.event_name),
    seats: seats && seats > 0 ? seats : null,
    street: text(f.address) ?? "",
    city: text(f.city_town) ?? "",
    stateProvince: text(f.state_prov) ?? "",
    zipPostal: text(f.zip_postal),
    startDate: parseLeadDate(f.start_date),
    endDate: parseLeadDate(f.end_date),
    internalNotes: lines.join("\n"),
  };
}
