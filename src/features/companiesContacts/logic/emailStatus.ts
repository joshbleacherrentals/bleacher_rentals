/**
 * Where an email is in its life (EmailMessages.status). 'success' is the normal state: an email
 * pulled from Gmail, or one the app has sent. The rest is an email the app is writing or sending.
 */
export type EmailStatus = "draft" | "sending" | "success" | "error";

/**
 * The status of a stored row. A row saved by a pull has none locally until the server's default
 * ('success') syncs back, and anything unrecognized is treated the same, so a row is never shown as
 * unsent by mistake.
 */
export function toEmailStatus(value: string | null | undefined): EmailStatus {
  return value === "draft" || value === "sending" || value === "error" ? value : "success";
}

/** Short words for a status, for the little indicator on an email. Null for a normal email. */
export function emailStatusLabel(status: EmailStatus): string | null {
  switch (status) {
    case "sending":
      return "Sending...";
    case "error":
      return "Not sent";
    case "draft":
      return "Draft";
    default:
      return null;
  }
}
