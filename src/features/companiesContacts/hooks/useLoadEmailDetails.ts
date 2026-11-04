"use client";

import { useCallback, useState } from "react";
import { loadEmailDetails } from "../db/loadEmailDetails";

export type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

/**
 * Loads an email's body from Gmail and saves it. The body then shows up through useEmailMessage, so
 * this only reports whether the load is running or failed.
 */
export function useLoadEmailDetails() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const load = useCallback(
    async (params: { emailMessageUuid: string; mailbox: string; googleId: string }) => {
      setState({ status: "loading" });
      try {
        await loadEmailDetails(params);
        setState({ status: "idle" });
      } catch (error: any) {
        setState({ status: "error", message: error?.message ?? "Could not load the email." });
      }
    },
    [],
  );

  return { state, load };
}
