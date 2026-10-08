export type ValidateAllowedEmailResult = { ok: true; email: string } | { ok: false; error: string };

// A bare address only: no display name, no angle brackets, no list separators.
const EMAIL_PATTERN = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/**
 * Checks an address typed on the Allowed Emails page and returns it in the form it is stored:
 * trimmed and lower-cased, which is also how the send guard compares. `ignoreId` is the row being
 * edited, so it may keep its own address.
 */
export function validateAllowedEmail(
  input: string,
  existing: { id: string; email: string | null }[],
  ignoreId?: string,
): ValidateAllowedEmailResult {
  const email = input.trim().toLowerCase();
  if (!email) return { ok: false, error: "Enter an email address." };
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "That doesn't look like an email address." };
  }
  const duplicate = existing.some(
    (row) => row.id !== ignoreId && row.email?.toLowerCase() === email,
  );
  if (duplicate) return { ok: false, error: "That email is already on the list." };
  return { ok: true, email };
}
