import { collectErrors, validateName } from "@/lib/validation/fields";

export type NameParts = { firstName: string; lastName: string };

/** The same rules as the contact form: a first name is required, a last name is optional. */
export function validateNameParts(parts: NameParts) {
  return collectErrors({
    firstName: validateName(parts.firstName, "First name", { required: true }),
    lastName: validateName(parts.lastName, "Last name"),
  });
}

export function trimNameParts(parts: NameParts): NameParts {
  return { firstName: parts.firstName.trim(), lastName: parts.lastName.trim() };
}

/** Whether saving would change nothing, so the editor can just close. */
export function sameNameParts(a: NameParts, b: NameParts): boolean {
  const [x, y] = [trimNameParts(a), trimNameParts(b)];
  return x.firstName === y.firstName && x.lastName === y.lastName;
}
