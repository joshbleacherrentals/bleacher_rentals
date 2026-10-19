/**
 * The website form submission a quote was created from (`Events.lead_submission`), arranged for
 * reading. The submission is kept exactly as received; nothing here changes it. Only fields the
 * submission actually holds are shown, so a quote never displays a label for something the form did
 * not send, and a field the form sent but this list does not know is shown under "Other".
 */

export type SubmissionRow = {
  label: string;
  /** Null when the person left the field empty. */
  value: string | null;
  /** How to draw the value: as plain text, or as a mail or phone link. */
  kind: "text" | "email" | "phone";
  /** Where a link goes, for `email` and `phone`. */
  href?: string;
};

export type SubmissionSection = { title: string; rows: SubmissionRow[] };

const SECTIONS: { title: string; fields: [key: string, label: string][] }[] = [
  {
    title: "Contact",
    fields: [
      ["name", "Name"],
      ["email", "Email"],
      ["phone", "Phone"],
    ],
  },
  {
    title: "Event",
    fields: [
      ["event_name", "Event Name"],
      ["start_date", "Event Start Date"],
      ["end_date", "Event End Date"],
      ["num_seats", "Estimated # of Seats Needed"],
      ["indoor_outdoor", "Indoor or Outdoor"],
    ],
  },
  {
    title: "Location",
    fields: [
      ["address", "Event Address"],
      ["city_town", "City/Town"],
      ["state_prov", "State/Province"],
      ["zip_postal", "Zip/Postal Code"],
    ],
  },
  { title: "Comments", fields: [["comment", "Comments"]] },
  {
    title: "Marketing",
    fields: [
      ["referral_method", "Referral Method"],
      ["referral_source", "Referral Source"],
      ["landing_page", "Landing Page"],
      ["referral_detail", "Referral Detail"],
      ["utm_source", "UTM Source"],
      ["utm_medium", "UTM Medium"],
      ["utm_campaign", "UTM Campaign"],
      ["campaign_name", "Campaign Name"],
      ["ad_name", "Ad Name"],
      ["gclid", "GCLID"],
      ["fbclid", "FBCLID"],
    ],
  },
];

const KNOWN_KEYS = new Set(SECTIONS.flatMap((s) => s.fields.map(([key]) => key)));

/** A submission value as text: a date is `{ value, unix }`, a checkbox group is a list. */
function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return asText(value.map(asText).filter(Boolean).join(", "));
  if (typeof value === "object") {
    const inner = (value as { value?: unknown }).value;
    return inner !== undefined ? asText(inner) : JSON.stringify(value);
  }
  return null;
}

/** `utm_source_2` as "Utm Source 2". */
const humanize = (key: string) =>
  key
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const EMAIL = /^[^\s@]+@[^\s@]+$/;

function toRow(key: string, label: string, raw: unknown): SubmissionRow {
  const value = asText(raw);
  if (value && key === "email" && EMAIL.test(value)) {
    return { label, value, kind: "email", href: `mailto:${value}` };
  }
  const dialable = value?.replace(/[^\d+]/g, "") ?? "";
  if (value && key === "phone" && dialable.replace(/\D/g, "").length >= 5) {
    return { label, value, kind: "phone", href: `tel:${dialable}` };
  }
  return { label, value, kind: "text" };
}

/** The raw column is JSON text in the local database, an object elsewhere. Null if neither. */
export function readLeadSubmission(raw: unknown): Record<string, unknown> | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The submission as sections of label/value rows; null when the quote has no submission. */
export function leadSubmissionSections(raw: unknown): SubmissionSection[] | null {
  const submission = readLeadSubmission(raw);
  if (!submission) return null;

  const sections: SubmissionSection[] = [];
  for (const { title, fields } of SECTIONS) {
    const rows = fields
      .filter(([key]) => key in submission)
      .map(([key, label]) => toRow(key, label, submission[key]));
    if (rows.length > 0) sections.push({ title, rows });
  }

  // What the form sent that is not listed above. An empty one says nothing, so it is left out.
  const other = Object.keys(submission)
    .filter((key) => !KNOWN_KEYS.has(key))
    .map((key) => toRow(key, humanize(key), submission[key]))
    .filter((row) => row.value !== null);
  if (other.length > 0) sections.push({ title: "Other", rows: other });

  return sections;
}
