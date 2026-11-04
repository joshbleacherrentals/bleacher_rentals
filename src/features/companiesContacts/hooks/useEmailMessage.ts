"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

type Row = {
  id: string;
  mailbox: string | null;
  google_id: string | null;
  subject: string | null;
  from_address: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  date: string | null;
  direction: string | null;
  details_id: string | null;
  body_text: string | null;
  body_html: string | null;
};

export type EmailMessageView = {
  id: string;
  /**
   * The mailbox holding this copy, and Gmail's id for it: what it takes to read the email from
   * Gmail. Empty only if the row is missing them, which the database does not allow.
   */
  mailbox: string;
  googleId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  /** ISO time, or null. */
  date: string | null;
  direction: "sent" | "received";
  /** Null until the body has been loaded from Gmail and saved. */
  detailsId: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
};

/**
 * One saved email with its body, when the body has been saved. Reactive: once the body is saved the
 * result updates by itself, which is how the modal fills in after loading it.
 */
export function useEmailMessage(emailMessageUuid: string): {
  email: EmailMessageView | null;
  isLoading: boolean;
} {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("EmailMessages as em")
        .leftJoin("EmailMessageDetails as d", "d.email_message_uuid", "em.id")
        .select([
          "em.id as id",
          "em.mailbox as mailbox",
          "em.google_id as google_id",
          "em.subject as subject",
          "em.from_address as from_address",
          "em.to_addresses as to_addresses",
          "em.cc_addresses as cc_addresses",
          "em.date as date",
          "em.direction as direction",
          "d.id as details_id",
          "d.body_text as body_text",
          "d.body_html as body_html",
        ])
        .where("em.id", "=", emailMessageUuid)
        .compile(),
    [emailMessageUuid],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const email = useMemo((): EmailMessageView | null => {
    const row = data?.[0];
    if (!row) return null;
    const parsed = row.date ? new Date(row.date) : null;
    return {
      id: row.id,
      mailbox: row.mailbox ?? "",
      googleId: row.google_id ?? "",
      subject: row.subject?.trim() || "(no subject)",
      from: row.from_address ?? "",
      to: row.to_addresses ?? "",
      cc: row.cc_addresses ?? "",
      date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
      direction: row.direction === "sent" ? "sent" : "received",
      detailsId: row.details_id,
      bodyText: row.body_text,
      bodyHtml: row.body_html,
    };
  }, [data]);

  return { email, isLoading };
}
