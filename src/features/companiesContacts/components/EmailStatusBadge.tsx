import { AlertCircle, Loader2, Pencil } from "lucide-react";
import { emailStatusLabel, type EmailStatus } from "../logic/emailStatus";

/**
 * A small indicator of where an email is: "Sending..." with a spinner while the app sends it, a red
 * "Not sent" when it could not be (the reason is on hover, and in full on the open email), "Draft"
 * for one that was saved but not sent. Nothing at all for an email that is simply there, which is
 * nearly all of them.
 */
export function EmailStatusBadge({
  status,
  errorText,
}: {
  status: EmailStatus;
  errorText: string | null;
}) {
  const label = emailStatusLabel(status);
  if (!label) return null;

  const base = "inline-flex shrink-0 items-center gap-1 text-xs";
  if (status === "error") {
    return (
      <span title={errorText ?? undefined} className={`${base} font-medium text-red-600`}>
        <AlertCircle className="size-3" aria-hidden />
        {label}
      </span>
    );
  }
  return (
    <span className={`${base} text-gray-500`}>
      {status === "sending" ? (
        <Loader2 className="size-3 animate-spin" aria-hidden />
      ) : (
        <Pencil className="size-3" aria-hidden />
      )}
      {label}
    </span>
  );
}
