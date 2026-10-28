"use client";

import { useCallback, useState } from "react";
import { saveContactEmails } from "../db/saveContactEmails";
import type { PulledEmail } from "../logic/emailActivity";

export type PullState =
  | { status: "idle" }
  | { status: "searching" }
  | { status: "saving"; found: number }
  | { status: "error"; message: string }
  | {
      status: "done";
      /** Emails Gmail returned for the address. */
      found: number;
      /** Of those, how many were new to our database. */
      added: number;
      mailboxesSearched: number;
      /** Mailboxes Gmail would not search (no longer served, ...). */
      mailboxesFailed: number;
    };

type EndpointBody = {
  error?: string;
  messages?: PulledEmail[];
  mailboxes?: { error?: string }[];
};

/**
 * Pulls every email involving an address from Gmail (all company mailboxes) and saves them for the
 * contact in the local database. The list on the page reads them back from there, so this hook
 * only reports progress and counts.
 */
export function usePullContactEmails() {
  const [state, setState] = useState<PullState>({ status: "idle" });

  const pull = useCallback(async (params: { contactUuid: string; address: string }) => {
    setState({ status: "searching" });

    let messages: PulledEmail[];
    let mailboxes: { error?: string }[];
    try {
      const res = await fetch(
        `/api/dev/gmail-contact-emails?email=${encodeURIComponent(params.address)}`,
      );
      const body: EndpointBody | null = await res.json().catch(() => null);

      if (!res.ok) {
        setState({
          status: "error",
          message: body?.error ?? `Could not pull emails (${res.status}).`,
        });
        return;
      }
      messages = body?.messages ?? [];
      mailboxes = body?.mailboxes ?? [];
    } catch {
      setState({ status: "error", message: "Could not reach the server. Try again." });
      return;
    }

    setState({ status: "saving", found: messages.length });
    try {
      const { added } = await saveContactEmails(params.contactUuid, messages);
      setState({
        status: "done",
        found: messages.length,
        added,
        mailboxesSearched: mailboxes.length,
        mailboxesFailed: mailboxes.filter((m) => m.error).length,
      });
    } catch (error: any) {
      setState({
        status: "error",
        message: `Found ${messages.length} emails but could not save them: ${error?.message ?? "unknown error"}`,
      });
    }
  }, []);

  return { state, pull };
}
