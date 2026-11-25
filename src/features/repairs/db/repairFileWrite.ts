import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../database.types";
import {
  REPAIR_FILE_BUCKET,
  REPAIR_FILE_MESSAGES,
  repairFilePath,
  type DraftFile,
  type FileFailure,
  type SaveFilesResult,
} from "../utils/repairFiles";
import type { RepairFileRow } from "../utils/repairWindow";

/**
 * The network part of the files of a repair: wait for the repair to be on the server, upload the new
 * files, delete the removed ones. The files go straight to Supabase, not to the local database
 * (spec 07 D99: `MaintenancePhotos` is not synced). docs/specs/repairs-09b3-files.md §2.4, §2.5 and §3
 * (D191 to D196, D204; the signatures are locked there).
 */

/** What the writer needs from Supabase, so that a test can pass a fake. */
export type RepairFilesClient = {
  /** Whether `MaintenanceEvents` has a row with this id; throws when the request fails. */
  repairExists: (repairId: string) => Promise<boolean>;
  /** Storage `upload(path, file, { upsert: false })`; throws on an error. */
  uploadObject: (path: string, file: File) => Promise<void>;
  /** Storage `remove([path])`; throws on an error. */
  removeObject: (path: string) => Promise<void>;
  /** `insert` into `MaintenancePhotos`; throws on an error. */
  insertRow: (repairId: string, path: string) => Promise<void>;
  /** `delete` from `MaintenancePhotos` by id; throws on an error. */
  deleteRow: (id: string) => Promise<void>;
};

export function makeRepairFilesClient(supabase: SupabaseClient<Database>): RepairFilesClient {
  return {
    repairExists: async (repairId) => {
      const { data, error } = await supabase
        .from("MaintenanceEvents")
        .select("id")
        .eq("id", repairId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },
    uploadObject: async (path, file) => {
      const { error } = await supabase.storage
        .from(REPAIR_FILE_BUCKET)
        .upload(path, file, { upsert: false });
      if (error) throw error;
    },
    removeObject: async (path) => {
      const { error } = await supabase.storage.from(REPAIR_FILE_BUCKET).remove([path]);
      if (error) throw error;
    },
    insertRow: async (repairId, path) => {
      const { error } = await supabase
        .from("MaintenancePhotos")
        .insert({ maintenance_event_uuid: repairId, photo_path: path });
      if (error) throw error;
    },
    deleteRow: async (id) => {
      const { error } = await supabase.from("MaintenancePhotos").delete().eq("id", id);
      if (error) throw error;
    },
  };
}

const WAIT_INTERVAL_MS = 500;
const WAIT_MAX_MS = 10_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * D193: true as soon as `exists` answers true; a request that throws counts as "not yet"; false when
 * `maxMs` has passed without a yes. The check and the clock are passed in, like
 * `waitForEmptyUploadQueue`. The defaults are 500 ms and 10 000 ms.
 */
export async function waitForRepairOnServer(input: {
  exists: () => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxMs?: number;
}): Promise<boolean> {
  const { exists, sleep, intervalMs = WAIT_INTERVAL_MS, maxMs = WAIT_MAX_MS } = input;
  let waited = 0;
  for (;;) {
    try {
      if (await exists()) return true;
    } catch {
      // No network or a refused request: the same as "not yet".
    }
    if (waited >= maxMs) return false;
    await sleep(intervalMs);
    waited += intervalMs;
  }
}

/** The text of whatever a client threw: an Error, a Supabase error object or plain text. */
function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * §2.4 steps 3 to 5, in the order of D204: the wait when there are files to add, the new files one
 * after another (D195), then the deletions (D196). Never throws: every failure is in the result.
 */
export async function saveRepairFiles(input: {
  client: RepairFilesClient;
  repairId: string;
  added: readonly DraftFile[];
  removed: readonly RepairFileRow[];
  makeObjectId?: () => string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<SaveFilesResult> {
  const { client, repairId, added, removed } = input;
  const makeObjectId = input.makeObjectId ?? (() => crypto.randomUUID());
  const sleep = input.sleep ?? defaultSleep;
  const notAdded: FileFailure[] = [];
  const notRemoved: FileFailure[] = [];

  if (added.length > 0) {
    const onServer = await waitForRepairOnServer({
      exists: () => client.repairExists(repairId),
      sleep,
    });
    if (!onServer) {
      for (const entry of added) {
        notAdded.push({ name: entry.file.name, message: REPAIR_FILE_MESSAGES.notOnServer });
      }
    } else {
      for (const entry of added) {
        const path = repairFilePath(repairId, makeObjectId(), entry.file);
        try {
          await client.uploadObject(path, entry.file);
        } catch (error) {
          notAdded.push({ name: entry.file.name, message: errorText(error) });
          continue;
        }
        try {
          await client.insertRow(repairId, path);
        } catch (error) {
          notAdded.push({ name: entry.file.name, message: errorText(error) });
          // An add never leaves an object without a row: take back the one just made.
          try {
            await client.removeObject(path);
          } catch (cleanup) {
            console.error("Could not remove an object that has no row:", cleanup);
          }
        }
      }
    }
  }

  for (const row of removed) {
    try {
      await client.deleteRow(row.id);
    } catch (error) {
      notRemoved.push({ name: row.name, message: errorText(error) });
      continue;
    }
    try {
      await client.removeObject(row.path);
    } catch (cleanup) {
      // The row has gone, so the list is true; the object is left in the bucket (D196).
      console.error("Could not remove the object of a deleted file:", cleanup);
    }
  }

  return { notAdded, notRemoved };
}
