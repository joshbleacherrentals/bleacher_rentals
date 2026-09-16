export type QboAuthErrorLike = {
  error?: string;
  error_description?: string;
  originalMessage?: string;
  message?: string;
};

/**
 * Turns the intuit-oauth-ts library's opaque refresh failure (e.g. its own
 * top-level `message: "Response has an Error"`, with the actually useful
 * `invalid_grant` / "Incorrect Token type or clientID" buried underneath)
 * into a message that tells the user what to actually do.
 *
 * `invalid_grant` here means the stored refresh token is no longer good for
 * this app's QBO client — most commonly because the connection needs
 * re-authenticating (the fix in every case this shape has actually been
 * seen), so that's the guidance given regardless of the exact underlying
 * reason.
 */
export function describeQboAuthError(e: QboAuthErrorLike | null | undefined): string {
  const reason =
    e?.error_description ?? e?.error ?? e?.originalMessage ?? e?.message ?? "unknown error";
  return `QuickBooks connection needs to be re-authenticated (${reason}). Go to /quickbooks and click "Re-authenticate" for this connection.`;
}
