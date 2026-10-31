import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export let DATABASE_NAME = "fitness-tracker";
export let workspaceGeneration = 0;
export let accountWorkspace = false;
export async function selectWorkspace(name: string, account: boolean) {
  await closeFitnessDatabase();
  DATABASE_NAME = name;
  accountWorkspace = account;
  workspaceGeneration++;
}
export const DATABASE_VERSION = 1;

export interface FitnessDatabase extends DBSchema {
  sessions: {
    key: string;
    value: unknown;
    indexes: { "by-program": string; "by-start": string };
  };
  drafts: { key: string; value: unknown };
  preferences: { key: string; value: unknown };
  metadata: { key: string; value: unknown };
  recovery: { key: string; value: unknown };
}

let connection: Promise<IDBPDatabase<FitnessDatabase>> | null = null;

export function openFitnessDatabase(): Promise<IDBPDatabase<FitnessDatabase>> {
  if (connection) return connection;
  if (typeof indexedDB === "undefined")
    return Promise.reject(
      new Error(
        "Persistent browser storage is unavailable. Open this website in a normal browser tab and try again.",
      ),
    );
  let rejectBlocked: (error: Error) => void = () => undefined;
  let abandoned = false;
  const blocked = new Promise<never>((_, reject) => {
    rejectBlocked = reject;
  });
  const opening = openDB<FitnessDatabase>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("sessions")) {
        const sessions = db.createObjectStore("sessions");
        sessions.createIndex("by-program", "snapshot.programId");
        sessions.createIndex("by-start", "startedAt");
      }
      for (const name of [
        "drafts",
        "preferences",
        "metadata",
        "recovery",
      ] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    },
    blocked() {
      abandoned = true;
      rejectBlocked(
        new Error(
          "A storage upgrade is blocked by another tab. Close other tracker tabs and retry. Your records have not been deleted.",
        ),
      );
    },
    blocking() {
      void opening.then((db) => db.close());
      connection = null;
    },
    terminated() {
      connection = null;
    },
  });
  void opening.then(
    (db) => {
      if (abandoned) db.close();
    },
    () => undefined,
  );
  connection = Promise.race([opening, blocked]).catch((error: unknown) => {
    connection = null;
    if (error instanceof DOMException && error.name === "VersionError") {
      throw new Error(
        "This browser contains data from a newer app version. Update the app before editing it. Do not clear site data.",
      );
    }
    throw error;
  });
  return connection;
}

/** Used in tests and when an upgrade needs another tab to release its connection. */
export async function closeFitnessDatabase(): Promise<void> {
  const pending = connection;
  connection = null;
  if (pending) (await pending).close();
}

/** Deliberately bypasses application validation so damaged records can be rescued. */
export async function readRawDatabase(): Promise<Record<string, unknown>> {
  const db = await openDB(DATABASE_NAME);
  try {
    const output: Record<string, unknown> = { databaseVersion: db.version };
    for (const name of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(name, "readonly");
      output[name] = await tx.objectStore(name).getAll();
      await tx.done;
    }
    return output;
  } finally {
    db.close();
  }
}
