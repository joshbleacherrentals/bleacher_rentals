"use client";

import { useMemo } from "react";
import type { Expression, SqlBool } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { storedToActivityEmail, type ActivityEmail } from "../logic/emailActivity";
import { selectThread, threadRoot, type ThreadRow } from "../logic/emailThread";

const threadRows = () =>
  db
    .selectFrom("EmailMessages")
    .select([
      "id",
      "mailbox",
      "google_message_id",
      "google_thread_id",
      "google_in_reply_to",
      "google_references",
      "from_address",
      "to_addresses",
      "cc_addresses",
      "subject",
      "date",
      "snippet",
      "direction",
      "status",
      "error_text",
    ]);

/**
 * An email of a thread: what a row shows, plus the headers as saved: the addresses, for the details
 * that drop down from its "To" line (Bcc is not among them: it is not saved), and what a reply to
 * it needs to be threaded under it (see emailReply.ts). Empty strings when a header was not saved.
 */
export type ThreadMessage = ActivityEmail & {
  fromHeader: string;
  toHeader: string;
  ccHeader: string;
  /** The subject as saved: the row's `subject` says "(no subject)" when there is none. */
  subjectHeader: string;
  /** Its Message-ID, and the Message-IDs before it in the conversation. */
  messageIdHeader: string;
  referencesHeader: string;
  /** The mailbox this copy is in and Gmail's thread id for it there. */
  mailbox: string;
  gmailThreadId: string;
};

/**
 * The saved emails in the same conversation as `emailMessageUuid` (itself included), oldest first.
 * Only emails already in the local database are listed. Reactive, so a newly saved email joins the
 * thread by itself. Bodies are not read here: each email loads its own when it is opened.
 */
export function useEmailThread(emailMessageUuid: string): {
  messages: ThreadMessage[];
  isLoading: boolean;
} {
  // First the opened email, to learn what its thread is called.
  const openedCompiled = useMemo(
    () => threadRows().where("id", "=", emailMessageUuid).compile(),
    [emailMessageUuid],
  );
  const { data: openedData, isLoading: openedLoading } = useTypedQuery(
    openedCompiled,
    expect<ThreadRow>(),
  );
  const opened = openedData?.[0] ?? null;
  const root = opened ? threadRoot(opened) : null;
  const mailbox = opened?.mailbox ?? null;
  const gmailThread = opened?.google_thread_id ?? null;

  // Then everything that could be in it. LIKE over-fetches (a `_` in an ID matches any character)
  // and selectThread keeps only the exact matches.
  const threadCompiled = useMemo(
    () =>
      threadRows()
        .where((eb) => {
          const conditions: Expression<SqlBool>[] = [eb("id", "=", emailMessageUuid)];
          if (root) {
            const pattern = `%${root}%`;
            conditions.push(
              eb("google_message_id", "like", pattern),
              eb("google_in_reply_to", "like", pattern),
              eb("google_references", "like", pattern),
            );
          }
          if (mailbox && gmailThread) {
            conditions.push(
              eb.and([eb("mailbox", "=", mailbox), eb("google_thread_id", "=", gmailThread)]),
            );
          }
          return eb.or(conditions);
        })
        .compile(),
    [emailMessageUuid, root, mailbox, gmailThread],
  );
  const { data, isLoading } = useTypedQuery(threadCompiled, expect<ThreadRow>());

  const messages = useMemo(
    () =>
      selectThread(emailMessageUuid, data ?? []).map((row) => ({
        ...storedToActivityEmail(row),
        fromHeader: row.from_address ?? "",
        toHeader: row.to_addresses ?? "",
        ccHeader: row.cc_addresses ?? "",
        subjectHeader: row.subject ?? "",
        messageIdHeader: row.google_message_id ?? "",
        referencesHeader: row.google_references ?? "",
        mailbox: row.mailbox ?? "",
        gmailThreadId: row.google_thread_id ?? "",
      })),
    [data, emailMessageUuid],
  );
  return { messages, isLoading: openedLoading || isLoading };
}
