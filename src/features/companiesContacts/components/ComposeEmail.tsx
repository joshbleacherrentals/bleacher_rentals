"use client";

import { useState } from "react";
import { ReplyBox } from "./ReplyBox";

/**
 * The box for writing a new email to a contact (a Compose), floating over the bottom right of the
 * page the way a reply does on an email's page, and the same size: it stays put while the page
 * scrolls. It can be minimized to a small card and restored with what was typed. Once the email is
 * saved and on its way the box closes (`onClose`). Navigating away closes it too, and the draft
 * with it.
 */
export function ComposeEmail({
  contactUuid,
  contactEmail,
  onClose,
}: {
  contactUuid: string;
  /** The contact's own address: who the email starts out addressed to. */
  contactEmail: string | null;
  onClose: () => void;
}) {
  const [minimized, setMinimized] = useState(false);

  return (
    <div
      className={`fixed bottom-4 right-6 z-40 max-w-[calc(100vw-3rem)] ${
        minimized ? "w-64" : "h-170 max-h-[calc(100vh-8rem)] w-170"
      }`}
    >
      <ReplyBox
        contactUuid={contactUuid}
        contactEmail={contactEmail}
        replyingTo={null}
        mode="compose"
        minimized={minimized}
        onMinimize={() => setMinimized(true)}
        onRestore={() => setMinimized(false)}
        onSent={onClose}
      />
    </div>
  );
}
