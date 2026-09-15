"use client";

import { formatDuration, perfNote } from "@/lib/perf/perfTrace";

/**
 * Fetches data from any Supabase table updates a Zustand store and caches it.
 *
 * @param tableName - Supabase table to query
 * @param setStore - Zustand store setter for the table's data
 * @param supabaseClient - Supabase client instance
 */

export const fetchTableSetStoreAndCache = async <T>(
  tableName: string,
  setStore: (data: T[]) => void,
  supabaseClient: any,
): Promise<boolean> => {
  const STORAGE_KEY = `cached-${tableName}`;
  // console.log(`Token ${token}`);
  // if (!token) return;

  // const supabase = await getSupabaseClient(token);
  // const supabase = supabaseClient || (await getSupabaseClient(token));
  // if (supabaseClient) console.log("Using passed supabase client: ", tableName);
  // supabase.realtime.setAuth(token);

  const fetchStartedAt = performance.now();
  const { data, error } = await supabaseClient.from(tableName).select("*");
  const fetchMs = performance.now() - fetchStartedAt;
  // console.log(`Fetched ${tableName}:`, data);
  if (tableName === "Blocks") {
    // console.log("Blocks data:", data);
  }

  if (error) {
    console.error(`Failed to fetch ${tableName}:`, error);
    return false;
  }

  if (data) {
    setStore(data);

    // Every work tracker save broadcasts over Pusher, which lands here in every
    // open tab. `JSON.stringify` of a whole table is synchronous on the main
    // thread, so it is timed separately from the network round-trip.
    const serializeStartedAt = performance.now();
    const serialized = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, serialized);
    const serializeMs = performance.now() - serializeStartedAt;

    perfNote(
      `full-table refetch ${tableName}: ${data.length} rows, ${(serialized.length / 1024 / 1024).toFixed(2)} MB — ` +
        `network ${formatDuration(fetchMs)}, serialize+localStorage ${formatDuration(serializeMs)} (blocks main thread)`,
    );

    return true;
  }

  return false;
};
