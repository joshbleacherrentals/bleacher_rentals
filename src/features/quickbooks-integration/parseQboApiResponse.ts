/**
 * A platform-level failure (504 timeout, 502/503 from whatever sits in
 * front of the app) returns its own plain-text/HTML error page instead of
 * JSON — our route handler never even got to run. `response.json()` on
 * that throws a raw SyntaxError ("Unexpected token 'A', \"An error o\"...")
 * that's meaningless to a user. This parses defensively and falls back to
 * a message that at least says what actually happened.
 */
export function parseQboApiResponseText(text: string, status: number): Record<string, unknown> {
  try {
    return JSON.parse(text);
  } catch {
    return {
      error:
        status === 504
          ? "The request timed out (504) — QuickBooks or the server may still be processing it. Wait a moment, then check the bill's status before retrying."
          : `Unexpected server error (${status}). Please try again.`,
    };
  }
}

export async function parseQboApiResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  return parseQboApiResponseText(text, response.status);
}
