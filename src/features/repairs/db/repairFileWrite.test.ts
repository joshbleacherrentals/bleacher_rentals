import { describe, expect, it, vi } from "vitest";
import {
  makeRepairFilesClient,
  saveRepairFiles,
  waitForRepairOnServer,
  type RepairFilesClient,
} from "./repairFileWrite";
import { REPAIR_FILE_MESSAGES, type DraftFile } from "../utils/repairFiles";
import type { RepairFileRow } from "../utils/repairWindow";

// docs/specs/repairs-09b3-files.md §2.4, §2.5, §3 and §7 (D193 to D196, D204). The writer talks to
// a `RepairFilesClient`, so a fake that records its calls stands in for Supabase, and a fake `sleep`
// records the waits.

const REPAIR = "r0000000-0000-4000-8000-000000000001";

function pick(name: string, type = "image/png"): File {
  return new File([], name, { type });
}
const draftFile = (name: string, type?: string): DraftFile => ({
  key: `key-${name}`,
  file: pick(name, type),
});
const stored = (id: string, name: string, path: string): RepairFileRow => ({
  id,
  name,
  kind: "photo",
  day: null,
  path,
});

type Fail = Partial<Record<"repairExists" | "upload" | "insert" | "deleteRow" | "remove", unknown>>;

/** A client that records every call in order and fails where `fail` says (by file name or id). */
function fakeClient(opts: { existsAfter?: number; fail?: Fail } = {}) {
  const calls: string[] = [];
  let asked = 0;
  const failFor = (kind: keyof Fail, key: string) => {
    const rule = opts.fail?.[kind];
    if (rule === true || rule === key) throw new Error(`${kind} failed for ${key}`);
  };
  const client: RepairFilesClient = {
    repairExists: async (id) => {
      asked += 1;
      calls.push(`exists:${id}`);
      if (opts.fail?.repairExists === "throw") throw new Error("offline");
      return opts.existsAfter !== undefined && asked > opts.existsAfter;
    },
    uploadObject: async (path, file) => {
      calls.push(`upload:${path}`);
      failFor("upload", file.name);
    },
    removeObject: async (path) => {
      calls.push(`remove:${path}`);
      failFor("remove", path);
    },
    insertRow: async (repairId, path) => {
      calls.push(`insert:${repairId}:${path}`);
      failFor("insert", path.split("/")[1]);
    },
    deleteRow: async (id) => {
      calls.push(`delete:${id}`);
      failFor("deleteRow", id);
    },
  };
  return { client, calls };
}

function fakeSleep() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

let counter = 0;
const nextId = () => `obj-${++counter}`;
const resetIds = () => {
  counter = 0;
};

describe("waitForRepairOnServer (D193)", () => {
  it("is true at the first answer, with no sleep", async () => {
    const { sleep, waits } = fakeSleep();
    expect(await waitForRepairOnServer({ exists: async () => true, sleep })).toBe(true);
    expect(waits).toEqual([]);
  });

  it("is true after three no answers, with three sleeps of 500 ms", async () => {
    const { sleep, waits } = fakeSleep();
    let asked = 0;
    const exists = async () => ++asked > 3;
    expect(await waitForRepairOnServer({ exists, sleep })).toBe(true);
    expect(asked).toBe(4);
    expect(waits).toEqual([500, 500, 500]);
  });

  it("is false after 10 000 ms of no, which is 21 requests", async () => {
    const { sleep, waits } = fakeSleep();
    let asked = 0;
    const exists = async () => {
      asked += 1;
      return false;
    };
    expect(await waitForRepairOnServer({ exists, sleep })).toBe(false);
    expect(asked).toBe(21);
    expect(waits).toHaveLength(20);
    expect(waits.every((ms) => ms === 500)).toBe(true);
  });

  it("counts a request that throws as not yet, and goes on", async () => {
    const { sleep } = fakeSleep();
    let asked = 0;
    const exists = async () => {
      asked += 1;
      if (asked < 3) throw new Error("offline");
      return true;
    };
    expect(await waitForRepairOnServer({ exists, sleep })).toBe(true);
    expect(asked).toBe(3);
  });

  it("takes its interval and its ceiling from the input", async () => {
    const { sleep, waits } = fakeSleep();
    expect(
      await waitForRepairOnServer({
        exists: async () => false,
        sleep,
        intervalMs: 100,
        maxMs: 300,
      }),
    ).toBe(false);
    expect(waits).toEqual([100, 100, 100]);
  });
});

describe("saveRepairFiles (§2.4 steps 3 to 5)", () => {
  it("waits for the repair before the first upload, then uploads a file and inserts its row, in the order picked", async () => {
    resetIds();
    const { client, calls } = fakeClient({ existsAfter: 0 });
    const { sleep } = fakeSleep();
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.PNG"), draftFile("b.pdf", "application/pdf")],
      removed: [],
      makeObjectId: nextId,
      sleep,
    });
    expect(result).toEqual({ notAdded: [], notRemoved: [] });
    expect(calls).toEqual([
      `exists:${REPAIR}`,
      `upload:${REPAIR}/obj-1.png`,
      `insert:${REPAIR}:${REPAIR}/obj-1.png`,
      `upload:${REPAIR}/obj-2.pdf`,
      `insert:${REPAIR}:${REPAIR}/obj-2.pdf`,
    ]);
  });

  it("makes every added file not added, with the not-on-server text, when the repair never answers, and uploads nothing", async () => {
    resetIds();
    const { client, calls } = fakeClient();
    const { sleep } = fakeSleep();
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.png"), draftFile("b.png")],
      removed: [],
      makeObjectId: nextId,
      sleep,
    });
    expect(result.notAdded).toEqual([
      { name: "a.png", message: REPAIR_FILE_MESSAGES.notOnServer },
      { name: "b.png", message: REPAIR_FILE_MESSAGES.notOnServer },
    ]);
    expect(calls.every((call) => call.startsWith("exists:"))).toBe(true);
    expect(calls).toHaveLength(21);
  });

  it("still runs the deletions when the repair never answered (D204)", async () => {
    const { client, calls } = fakeClient();
    const { sleep } = fakeSleep();
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.png")],
      removed: [stored("f1", "Photo 1", "r/old.jpg")],
      sleep,
    });
    expect(result.notAdded).toHaveLength(1);
    expect(result.notRemoved).toEqual([]);
    expect(calls).toContain("delete:f1");
    expect(calls).toContain("remove:r/old.jpg");
  });

  it("does not run the wait when there is nothing to add", async () => {
    const { client, calls } = fakeClient();
    const { sleep, waits } = fakeSleep();
    await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [],
      removed: [stored("f1", "Photo 1", "r/old.jpg")],
      sleep,
    });
    expect(calls.some((call) => call.startsWith("exists:"))).toBe(false);
    expect(waits).toEqual([]);
  });

  it("goes on with the other files when an upload fails, and lists it with the error text (D195)", async () => {
    resetIds();
    const { client, calls } = fakeClient({ existsAfter: 0, fail: { upload: "b.png" } });
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.png"), draftFile("b.png"), draftFile("c.png")],
      removed: [],
      makeObjectId: nextId,
      sleep: fakeSleep().sleep,
    });
    expect(result.notAdded).toEqual([{ name: "b.png", message: "upload failed for b.png" }]);
    expect(calls).toContain(`insert:${REPAIR}:${REPAIR}/obj-1.png`);
    expect(calls).toContain(`insert:${REPAIR}:${REPAIR}/obj-3.png`);
    expect(calls).not.toContain(`insert:${REPAIR}:${REPAIR}/obj-2.png`);
  });

  it("removes the object that an insert that failed had made, and lists the file", async () => {
    resetIds();
    const { client, calls } = fakeClient({ existsAfter: 0, fail: { insert: "obj-1.png" } });
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.png")],
      removed: [],
      makeObjectId: nextId,
      sleep: fakeSleep().sleep,
    });
    expect(result.notAdded).toEqual([{ name: "a.png", message: "insert failed for obj-1.png" }]);
    expect(calls).toContain(`remove:${REPAIR}/obj-1.png`);
  });

  it("deletes the row before the object (D196)", async () => {
    const { client, calls } = fakeClient();
    await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [],
      removed: [stored("f1", "Photo 1", "r/old.jpg")],
      sleep: fakeSleep().sleep,
    });
    expect(calls).toEqual(["delete:f1", "remove:r/old.jpg"]);
  });

  it("lists a row that cannot be deleted as not removed, and leaves its object alone", async () => {
    const { client, calls } = fakeClient({ fail: { deleteRow: "f1" } });
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [],
      removed: [stored("f1", "Photo 1", "r/old.jpg"), stored("f2", "PDF 1", "r/old.pdf")],
      sleep: fakeSleep().sleep,
    });
    expect(result.notRemoved).toEqual([{ name: "Photo 1", message: "deleteRow failed for f1" }]);
    expect(calls).not.toContain("remove:r/old.jpg");
    expect(calls).toContain("remove:r/old.pdf");
  });

  it("does not list an object that cannot be removed after its row has gone", async () => {
    const { client } = fakeClient({ fail: { remove: "r/old.jpg" } });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [],
      removed: [stored("f1", "Photo 1", "r/old.jpg")],
      sleep: fakeSleep().sleep,
    });
    errors.mockRestore();
    expect(result).toEqual({ notAdded: [], notRemoved: [] });
  });

  it("adds before it deletes (D204)", async () => {
    resetIds();
    const { client, calls } = fakeClient({ existsAfter: 0 });
    await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.png")],
      removed: [stored("f1", "Photo 1", "r/old.jpg")],
      makeObjectId: nextId,
      sleep: fakeSleep().sleep,
    });
    const insert = calls.findIndex((call) => call.startsWith("insert:"));
    const del = calls.findIndex((call) => call.startsWith("delete:"));
    expect(insert).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(insert);
  });

  it("never throws, whatever the client does", async () => {
    const client: RepairFilesClient = {
      repairExists: async () => true,
      uploadObject: async () => {
        throw "plain text, not an Error";
      },
      removeObject: async () => {
        throw new Error("x");
      },
      insertRow: async () => {
        throw new Error("x");
      },
      deleteRow: async () => {
        throw { message: "a plain object" };
      },
    };
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await saveRepairFiles({
      client,
      repairId: REPAIR,
      added: [draftFile("a.png")],
      removed: [stored("f1", "Photo 1", "r/old.jpg")],
      sleep: fakeSleep().sleep,
    });
    errors.mockRestore();
    expect(result.notAdded).toEqual([{ name: "a.png", message: "plain text, not an Error" }]);
    expect(result.notRemoved).toEqual([{ name: "Photo 1", message: "a plain object" }]);
  });
});

describe("makeRepairFilesClient", () => {
  /** A chainable stand-in for the part of supabase-js the client calls; it records and answers. */
  function fakeSupabase(answers: { error?: { message: string } | null; data?: unknown } = {}) {
    const log: unknown[][] = [];
    const answer = { data: answers.data ?? null, error: answers.error ?? null };
    const chain = (label: string) => {
      const api: any = {
        select: (...args: unknown[]) => (log.push([label, "select", ...args]), api),
        eq: (...args: unknown[]) => (log.push([label, "eq", ...args]), api),
        maybeSingle: () => (log.push([label, "maybeSingle"]), Promise.resolve(answer)),
        insert: (...args: unknown[]) => (
          log.push([label, "insert", ...args]),
          Promise.resolve(answer)
        ),
        delete: () => (log.push([label, "delete"]), api),
        then: (resolve: (value: unknown) => unknown) => resolve(answer),
      };
      return api;
    };
    const supabase: any = {
      from: (table: string) => chain(table),
      storage: {
        from: (bucket: string) => ({
          upload: (...args: unknown[]) => (
            log.push([bucket, "upload", ...args]),
            Promise.resolve(answer)
          ),
          remove: (...args: unknown[]) => (
            log.push([bucket, "remove", ...args]),
            Promise.resolve(answer)
          ),
        }),
      },
    };
    return { supabase, log };
  }

  it("asks MaintenanceEvents for the repair by id", async () => {
    const { supabase, log } = fakeSupabase({ data: { id: REPAIR } });
    expect(await makeRepairFilesClient(supabase).repairExists(REPAIR)).toBe(true);
    expect(log).toContainEqual(["MaintenanceEvents", "select", "id"]);
    expect(log).toContainEqual(["MaintenanceEvents", "eq", "id", REPAIR]);
    const none = fakeSupabase({ data: null });
    expect(await makeRepairFilesClient(none.supabase).repairExists(REPAIR)).toBe(false);
  });

  it("throws what Supabase answers as an error", async () => {
    const { supabase } = fakeSupabase({ error: { message: "nope" } });
    const client = makeRepairFilesClient(supabase);
    await expect(client.repairExists(REPAIR)).rejects.toMatchObject({ message: "nope" });
    await expect(client.insertRow(REPAIR, "p")).rejects.toMatchObject({ message: "nope" });
    await expect(client.deleteRow("f1")).rejects.toMatchObject({ message: "nope" });
    await expect(client.removeObject("p")).rejects.toMatchObject({ message: "nope" });
    await expect(client.uploadObject("p", pick("a.png"))).rejects.toMatchObject({
      message: "nope",
    });
  });

  it("uploads without upsert to the bucket, removes by path, inserts and deletes the row", async () => {
    const { supabase, log } = fakeSupabase();
    const client = makeRepairFilesClient(supabase);
    const file = pick("a.png");
    await client.uploadObject("r/o.png", file);
    await client.removeObject("r/o.png");
    await client.insertRow(REPAIR, "r/o.png");
    await client.deleteRow("f1");
    expect(log).toContainEqual([
      "maintenance-photos",
      "upload",
      "r/o.png",
      file,
      { upsert: false },
    ]);
    expect(log).toContainEqual(["maintenance-photos", "remove", ["r/o.png"]]);
    expect(log).toContainEqual([
      "MaintenancePhotos",
      "insert",
      { maintenance_event_uuid: REPAIR, photo_path: "r/o.png" },
    ]);
    expect(log).toContainEqual(["MaintenancePhotos", "eq", "id", "f1"]);
  });
});
