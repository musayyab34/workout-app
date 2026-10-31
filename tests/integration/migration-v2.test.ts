import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { openDB, deleteDB } from "idb";
import {
  selectWorkspace,
  closeFitnessDatabase,
  openFitnessDatabase,
} from "@/lib/storage/db";
import { migrateLegacy } from "@/lib/storage/migration";
import {
  createDraft,
  transition,
  finalizeDraft,
} from "@/features/workout/machine";
import { conditioningProgram } from "@/programs/catalog";
import {
  loadDataset,
  mutateDataset,
  getRecovery,
} from "@/lib/storage/repository";
import { defaultPreferences } from "@/domain/schemas";
it("copies legacy records and pre-import recovery losslessly, prevents old clients and never replays a completed migration", async () => {
  await closeFitnessDatabase();
  await deleteDB("fitness-tracker");
  const old = await openDB("fitness-tracker", 1, {
    upgrade(db) {
      for (const s of [
        "sessions",
        "drafts",
        "preferences",
        "metadata",
        "recovery",
      ])
        db.createObjectStore(s);
    },
  });
  let d = createDraft(conditioningProgram, 90, 1000000000000, "UTC");
  delete d.snapshot.context;
  d = transition(d, { type: "end" }, 1000000001000);
  const session = finalizeDraft(d);
  const dataset = {
    revision: 7,
    sessions: [session],
    draft: null,
    preferences: defaultPreferences,
  };
  await old.put("sessions", session, session.id);
  await old.put("preferences", defaultPreferences, "main");
  await old.put("metadata", 7, "revision");
  await old.put("metadata", 1, "schemaVersion");
  await old.put(
    "recovery",
    { capturedAt: new Date(1000000002000).toISOString(), dataset },
    "before-import",
  );
  old.close();
  await selectWorkspace("migration-test", false);
  await migrateLegacy();
  expect((await loadDataset()).sessions).toEqual([session]);
  expect((await getRecovery())?.dataset).toEqual(dataset);
  await expect(openDB("fitness-tracker", 1)).rejects.toThrow();
  const source = await openDB("fitness-tracker", 2);
  expect(await source.get("sessions", session.id)).toEqual(session);
  source.close();
  const current = await loadDataset();
  await mutateDataset(current.revision, (d) => ({
    ...d,
    preferences: { ...d.preferences, defaultRestSeconds: 30 },
  }));
  await migrateLegacy();
  expect((await loadDataset()).preferences.defaultRestSeconds).toBe(30);
  expect(
    await (await openFitnessDatabase()).get("metadata", "legacyMigrated"),
  ).toBe(true);
  await closeFitnessDatabase();
});
