"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { makeRateLookup } from "../utils/exchangeRates";
import {
  NO_RATES,
  createRatesRequests,
  nextState,
  rateView,
  startCadUsdRatesSession,
  type RatesRequests,
  type RatesSessionState,
} from "./cadUsdRatesSession";

// docs/specs/dashboard-analytics-03-converter.md §2.6. A thin wrapper: every rule of the hook is in
// cadUsdRatesSession.ts. It is for client components. It reads the memory after the first render,
// never during it, so the server and the browser render the same first frame.

export type CadUsdRatesState = {
  /** idle: nothing to convert. loading: no rate is known yet and a request is open.
      ready: at least one rate is known (a request for newer days may still be open).
      unavailable: no rate is known and the request ended without one. */
  status: "idle" | "loading" | "ready" | "unavailable";
  rateFor: (day: string) => number | null;
};

/** The storage of the browser, or null when there is none or the browser blocks it. */
function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useCadUsdRates(params: {
  oldestCadDay: string | null;
  today: string;
}): CadUsdRatesState {
  const { oldestCadDay, today } = params;
  const [state, setState] = useState<RatesSessionState>({ status: "loading", rates: NO_RATES });
  // Kept across the second start of strict mode, so one pair makes one request.
  const requestsRef = useRef<RatesRequests | null>(null);

  useEffect(() => {
    requestsRef.current ??= createRatesRequests();
    return startCadUsdRatesSession({
      oldestCadDay,
      today,
      storage: browserStorage(),
      requests: requestsRef.current,
      onChange: (next) => setState((previous) => nextState(previous, next)),
    });
  }, [oldestCadDay, today]);

  const view = rateView(oldestCadDay, state);
  // `rates` changes only when the known days change, so `rateFor` keeps its identity until then.
  const rateFor = useMemo(() => makeRateLookup(view.rates), [view.rates]);
  const status = view.status;

  return useMemo(() => ({ status, rateFor }), [status, rateFor]);
}
