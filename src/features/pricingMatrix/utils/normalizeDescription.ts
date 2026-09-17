/** Trims; returns null for empty / whitespace-only input. Keeps inner newlines. */
export function normalizeDescription(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
