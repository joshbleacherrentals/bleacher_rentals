/**
 * Splits a name into everything before its last word and the last word itself, so the last word
 * can be kept together with something that follows it (a badge) when the name wraps.
 * The head keeps its trailing space.
 */
export function splitLastWord(name: string): [head: string, last: string] {
  const trimmed = name.trim();
  const cut = trimmed.lastIndexOf(" ");
  return cut === -1 ? ["", trimmed] : [trimmed.slice(0, cut + 1), trimmed.slice(cut + 1)];
}
