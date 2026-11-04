import { validateEmail, validatePhone } from "@/lib/validation/fields";
import { findContactDuplicates } from "../utils/findDuplicates";

export type ContactChannel = "email" | "phone";

type Candidate = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
};

const LABEL: Record<ContactChannel, string> = { email: "Email", phone: "Phone" };

/**
 * Why `value` cannot be saved as a contact's email or phone, or null when it can. Same rules as
 * the contact form: it must look like an email / phone number, and no other contact may already
 * have it. Only the field being edited is compared, so a duplicate on the other field (which the
 * form would also have flagged) does not block this edit. Blank is always fine: it clears the field.
 */
export function validateContactChannel(
  channel: ContactChannel,
  value: string,
  contacts: Candidate[],
  excludeId: string,
): string | null {
  const shapeError = channel === "email" ? validateEmail(value) : validatePhone(value);
  if (shapeError) return shapeError;

  const [owner] = findContactDuplicates(
    contacts,
    { email: channel === "email" ? value : "", phone: channel === "phone" ? value : "" },
    excludeId,
  );
  if (!owner) return null;

  const name = `${owner.firstName} ${owner.lastName ?? ""}`.trim();
  return `${LABEL[channel]} already belongs to ${name}.`;
}
