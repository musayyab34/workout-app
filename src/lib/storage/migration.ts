import { openDB } from "idb";
import { openFitnessDatabase } from "./db";
import { validateDataset } from "@/domain/invariants";
import { defaultPreferences } from "@/domain/schemas";
export async function migrateLegacy() {
  const dest = await openFitnessDatabase();
  if (await dest.get("metadata", "legacyMigrated")) return;
  let abandoned = false;
  const source = await new Promise<import("idb").IDBPDatabase>(
    (resolve, reject) => {
      const p = openDB("fitness-tracker", 2, {
        blocked() {
          abandoned = true;
          reject(
            new Error(
              "Close older tracker tabs to finish the storage upgrade. No records were removed.",
            ),
          );
        },
      });
      void p.then((db) => {
        if (abandoned) db.close();
        else resolve(db);
      }, reject);
    },
  );
  try {
    if (!source.objectStoreNames.contains("sessions")) {
      await dest.put("metadata", true, "legacyMigrated");
      return;
    }
    const names = Array.from(source.objectStoreNames);
    const tx = source.transaction(names, "readonly");
    const rows = await Promise.all(
      names.map(async (n) => ({
        name: n,
        keys: await tx.objectStore(n).getAllKeys(),
        values: await tx.objectStore(n).getAll(),
      })),
    );
    await tx.done;
    const values = (n: string) => rows.find((r) => r.name === n);
    const get = (n: string, k: string) => {
      const r = values(n);
      return r?.values[r.keys.indexOf(k)];
    };
    validateDataset({
      revision: get("metadata", "revision") ?? 0,
      sessions: values("sessions")?.values ?? [],
      draft: get("drafts", "active") ?? null,
      preferences: get("preferences", "main") ?? defaultPreferences,
    });
    const out = dest.transaction(
      ["sessions", "drafts", "preferences", "metadata", "recovery"],
      "readwrite",
    );
    if (await out.objectStore("metadata").get("legacyMigrated")) {
      await out.done;
      return;
    }
    for (const r of rows)
      if (Array.from(out.objectStoreNames).includes(r.name as "metadata"))
        for (let i = 0; i < r.keys.length; i++)
          await out
            .objectStore(r.name as "metadata")
            .put(r.values[i], r.keys[i] as string);
    await out.objectStore("metadata").put(true, "legacyMigrated");
    await out.done;
  } finally {
    source.close();
  }
}

export async function rawLegacyExport() {
  const db = await openDB("fitness-tracker");
  try {
    const stores: Record<string, unknown> = { databaseVersion: db.version };
    for (const name of Array.from(db.objectStoreNames)) {
      const tx = db.transaction(name);
      stores[name] = {
        keys: await tx.objectStore(name).getAllKeys(),
        values: await tx.objectStore(name).getAll(),
      };
      await tx.done;
    }
    return stores;
  } finally {
    db.close();
  }
}
