"use client";

import { useEffect, useRef } from "react";
import { forwardableText } from "../logic/emailForward";
import { useEmailMessage } from "./useEmailMessage";
import { useLoadEmailDetails } from "./useLoadEmailDetails";

/**
 * The text of the email a forward carries (see forwardedMessageText), once its body is saved. When
 * `enabled` and the body is not saved yet it is read from Gmail and saved, the way opening the
 * email does; the loader shares a load already under way, so both can ask at once. `text` is null
 * until the body is there, then the email's text (empty for an email with no body). `error` is
 * set when the body could not be loaded.
 */
export function useForwardedText(
  emailMessageUuid: string,
  enabled: boolean,
): { text: string | null; error: string | null } {
  const { email } = useEmailMessage(emailMessageUuid);
  const { state, load } = useLoadEmailDetails();

  // Once per email, as soon as it is known to have no saved body.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !email || email.detailsId || !email.mailbox || !email.googleId) return;
    if (startedFor.current === email.id) return;
    startedFor.current = email.id;
    void load({ emailMessageUuid: email.id, mailbox: email.mailbox, googleId: email.googleId });
  }, [enabled, email, load]);

  return {
    text: enabled && email?.detailsId ? forwardableText(email) : null,
    error: state.status === "error" ? state.message : null,
  };
}
