import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { emptyDataset, type Dataset, type Session } from "@/domain/schemas";
import { conditioningProgram } from "@/programs/catalog";
import {
  createDraft,
  transition,
  finalizeDraft,
  correctSet,
} from "@/features/workout/machine";
import { elapsedDuration, remainingRest } from "@/features/workout/timer";
import {
  closeFitnessDatabase,
  DATABASE_NAME,
  openFitnessDatabase,
} from "@/lib/storage/db";
import {
  loadDataset,
  mutateDataset,
  saveDraft,
  finalizeSession,
  updatePreferences,
  getRecovery,
  restoreRecovery,
  StaleRevisionError,
  StoredDataError,
  rawExport,
  recordExportRequest,
  getLastExportRequest,
} from "@/lib/storage/repository";
import {
  createBackup,
  parseBackup,
  serializeBackup,
  previewImport,
  applyImport,
  equivalentSession,
} from "@/lib/backup";

const START = Date.parse("2026-10-20T08:00:00.000Z");
const EXPORT = new Date(START + 600000).toISOString();
function partialSession(): Session {
  let draft = createDraft(conditioningProgram, 90, START, "Asia/Shanghai");
  draft = transition(
    draft,
    { type: "confirm", setId: draft.currentSetId!, value: "13" },
    START + 10000,
  );
  draft = transition(draft, { type: "end" }, START + 20000);
  return finalizeDraft(draft);
}
function datasetWith(session: Session): Dataset {
  return { ...emptyDataset(), sessions: [session] };
}

beforeEach(async () => {
  await closeFitnessDatabase();
  await deleteDB(DATABASE_NAME);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await closeFitnessDatabase();
});

describe("transactional local repository", () => {
  it("initializes defaults and persists preferences across connections", async () => {
    const initial = await loadDataset();
    expect(initial).toEqual(emptyDataset());
    await updatePreferences(0, {
      defaultRestSeconds: 45,
      soundEnabled: false,
      vibrationEnabled: false,
    });
    await closeFitnessDatabase();
    expect((await loadDataset()).preferences.defaultRestSeconds).toBe(45);
  });
  it("atomically rejects stale tabs", async () => {
    const first = await loadDataset();
    const second = await loadDataset();
    await updatePreferences(first.revision, {
      ...first.preferences,
      defaultRestSeconds: 30,
    });
    await expect(
      updatePreferences(second.revision, {
        ...second.preferences,
        defaultRestSeconds: 120,
      }),
    ).rejects.toBeInstanceOf(StaleRevisionError);
    expect((await loadDataset()).preferences.defaultRestSeconds).toBe(30);
  });
  it("validation failure leaves every prior record intact", async () => {
    await updatePreferences(0, {
      defaultRestSeconds: 45,
      soundEnabled: false,
      vibrationEnabled: false,
    });
    await expect(
      mutateDataset(1, (data) => ({
        ...data,
        preferences: { ...data.preferences, defaultRestSeconds: -1 },
      })),
    ).rejects.toThrow();
    const after = await loadDataset();
    expect(after.revision).toBe(1);
    expect(after.preferences.defaultRestSeconds).toBe(45);
  });
  it("finalizes history and removes the draft together, idempotently", async () => {
    let draft = createDraft(conditioningProgram, 90, START, "UTC");
    draft = transition(draft, { type: "end" }, START + 10000);
    const saved = await saveDraft(0, draft);
    const session = finalizeDraft(draft);
    const final = await finalizeSession(saved.revision, session);
    expect(final.draft).toBeNull();
    expect(final.sessions).toHaveLength(1);
    const again = await finalizeSession(saved.revision, session);
    expect(again.sessions).toHaveLength(1);
    expect(again.revision).toBe(final.revision);
  });
  it("refuses corrupt stored data while retaining a raw export path", async () => {
    const db = await openFitnessDatabase();
    await db.put("sessions", { broken: true }, "broken");
    await expect(loadDataset()).rejects.toBeInstanceOf(StoredDataError);
    const raw = await rawExport();
    expect(raw.sessions).toEqual([{ broken: true }]);
  });
  it("refuses unsupported metadata versions without clearing records", async () => {
    const db = await openFitnessDatabase();
    await db.put("metadata", 99, "schemaVersion");
    await expect(loadDataset()).rejects.toBeInstanceOf(StoredDataError);
    expect(await db.get("metadata", "schemaVersion")).toBe(99);
  });
  it("export request metadata does not stale an import preview", async () => {
    await recordExportRequest(EXPORT);
    expect(await getLastExportRequest()).toBe(EXPORT);
    expect((await loadDataset()).revision).toBe(0);
  });
});

describe("backup validation and restoration", () => {
  it("round-trips all saved user data", () => {
    const source = datasetWith(partialSession());
    const restored = parseBackup(serializeBackup(createBackup(source, EXPORT)));
    expect(restored.sessions).toEqual(source.sessions);
    expect(restored.preferences).toEqual(source.preferences);
  });
  it("rejects malformed JSON, wrong applications, and unsupported versions", () => {
    expect(() => parseBackup("{")).toThrow("valid JSON");
    expect(() => parseBackup(JSON.stringify({ application: "other" }))).toThrow(
      "another application",
    );
    const backup = createBackup(emptyDataset(), EXPORT);
    expect(() =>
      parseBackup(JSON.stringify({ ...backup, formatVersion: 99 })),
    ).toThrow("newer application");
  });
  it("rejects duplicate IDs and incorrect declared counts", () => {
    const backup = createBackup(datasetWith(partialSession()), EXPORT);
    expect(() =>
      parseBackup(
        JSON.stringify({
          ...backup,
          sessions: [...backup.sessions, backup.sessions[0]],
          counts: { sessions: 2, drafts: 0 },
        }),
      ),
    ).toThrow("Duplicate");
    expect(() =>
      parseBackup(
        JSON.stringify({ ...backup, counts: { sessions: 99, drafts: 0 } }),
      ),
    ).toThrow("counts");
  });
  it("rejects inconsistent result statuses and recording kinds", () => {
    const backup = createBackup(datasetWith(partialSession()), EXPORT);
    const invalid = structuredClone(backup);
    invalid.sessions[0].sets[0].status = "skipped";
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow("inconsistent");
    const unsupported = structuredClone(backup) as unknown as {
      sessions: {
        snapshot: { exercises: { sets: { recordingKind: string }[] }[] };
      }[];
    };
    unsupported.sessions[0].snapshot.exercises[0].sets[0].recordingKind =
      "duration";
    expect(() => parseBackup(JSON.stringify(unsupported))).toThrow(
      "recordingKind",
    );
  });
  it("rejects export timestamps earlier than the data", () => {
    expect(() =>
      createBackup(
        datasetWith(partialSession()),
        new Date(START - 1).toISOString(),
      ),
    ).toThrow("later than the export");
  });
  it("ignores local revision and update metadata when comparing equivalent sessions", () => {
    const original = partialSession();
    expect(
      equivalentSession(original, {
        ...original,
        revision: original.revision + 10,
        updatedAt: EXPORT,
      }),
    ).toBe(true);
  });
  it("merges repeated backups without duplicates", async () => {
    const backup = createBackup(datasetWith(partialSession()), EXPORT);
    const first = await applyImport(
      previewImport(await loadDataset(), backup, { mode: "merge" }),
    );
    const preview = previewImport(first, backup, { mode: "merge" });
    expect(preview.unchanged).toBe(1);
    expect(preview.added).toBe(0);
    const second = await applyImport(preview);
    expect(second.sessions).toHaveLength(1);
  });
  it("conflicts default to local and explicit imported choice replaces the record", () => {
    const localSession = partialSession();
    const importedSession = correctSet(
      localSession,
      localSession.sets[0].id,
      "recorded",
      17,
      undefined,
      START + 30000,
    );
    const local = datasetWith(localSession);
    const backup = createBackup(datasetWith(importedSession), EXPORT);
    const keep = previewImport(local, backup, { mode: "merge" });
    expect(keep.conflicts).toHaveLength(1);
    expect(keep.candidate.sessions[0].sets[0].actualReps).toBe(13);
    const use = previewImport(local, backup, {
      mode: "merge",
      sessionChoices: { [localSession.id]: "imported" },
    });
    expect(use.candidate.sessions[0].sets[0].actualReps).toBe(17);
  });
  it("pauses imported running rest at export time, excluding days away", () => {
    let draft = createDraft(conditioningProgram, 90, START, "UTC");
    draft = transition(
      draft,
      { type: "confirm", setId: draft.currentSetId!, value: "20" },
      START + 10000,
    );
    const backup = createBackup(
      { ...emptyDataset(), draft },
      new Date(START + 30000).toISOString(),
    );
    const restored = previewImport(emptyDataset(), backup, { mode: "replace" })
      .candidate.draft!;
    expect(restored.phase).toBe("paused");
    expect(restored.rest?.remainingMs).toBe(70000);
    const daysLater = START + 3 * 86400000;
    expect(elapsedDuration(restored, daysLater)).toBe(30000);
    const resumed = transition(restored, { type: "resume" }, daysLater);
    expect(remainingRest(resumed.rest, daysLater)).toBe(70000);
  });
  it("restores already-paused and Review drafts without changing their timing", () => {
    let draft = createDraft(conditioningProgram, 90, START, "UTC");
    draft = transition(draft, { type: "pause" }, START + 10000);
    const paused = previewImport(
      emptyDataset(),
      createBackup({ ...emptyDataset(), draft }, EXPORT),
      { mode: "merge" },
    ).candidate.draft!;
    expect(paused.pause?.startedAt).toBe(draft.pause?.startedAt);
    draft = transition(draft, { type: "end" }, START + 20000);
    const review = previewImport(
      emptyDataset(),
      createBackup({ ...emptyDataset(), draft }, EXPORT),
      { mode: "merge" },
    ).candidate.draft!;
    expect(review.phase).toBe("review");
    expect(review.endedAt).toBe(draft.endedAt);
  });
  it("reconciles rest expired before export without restarting it", () => {
    let draft = createDraft(conditioningProgram, 90, START, "UTC");
    draft = transition(
      draft,
      { type: "confirm", setId: draft.currentSetId!, value: "20" },
      START + 10000,
    );
    const restored = previewImport(
      emptyDataset(),
      createBackup({ ...emptyDataset(), draft }, EXPORT),
      { mode: "merge" },
    ).candidate.draft!;
    expect(restored.pause?.previousPhase).toBe("ready");
    expect(restored.rest?.remainingMs).toBe(0);
  });
  it("requires choosing between two unfinished workouts", () => {
    const local = {
      ...emptyDataset(),
      draft: createDraft(conditioningProgram, 90, START, "UTC"),
    };
    const backup = createBackup(
      {
        ...emptyDataset(),
        draft: createDraft(conditioningProgram, 90, START, "UTC"),
      },
      EXPORT,
    );
    const pending = previewImport(local, backup, { mode: "merge" });
    expect(pending.canApply).toBe(false);
    const resolved = previewImport(local, backup, {
      mode: "merge",
      draftChoice: "local",
    });
    expect(resolved.canApply).toBe(true);
    expect(resolved.candidate.draft?.id).toBe(local.draft.id);
  });
  it("restores unknown programs from complete supported historical snapshots", () => {
    const session = partialSession();
    session.snapshot.programId = "unknown-program";
    session.snapshot.programName = "Old program";
    const preview = previewImport(
      emptyDataset(),
      createBackup(datasetWith(session), EXPORT),
      { mode: "merge" },
    );
    expect(preview.candidate.sessions[0].snapshot.programId).toBe(
      "unknown-program",
    );
  });
  it("rejects a stale preview without writing an import or recovery copy", async () => {
    const preview = previewImport(
      await loadDataset(),
      createBackup(datasetWith(partialSession()), EXPORT),
      { mode: "replace" },
    );
    await updatePreferences(0, {
      defaultRestSeconds: 30,
      soundEnabled: false,
      vibrationEnabled: false,
    });
    await expect(applyImport(preview)).rejects.toBeInstanceOf(
      StaleRevisionError,
    );
    expect((await loadDataset()).sessions).toHaveLength(0);
    expect(await getRecovery()).toBeNull();
  });
  it("replacement can be atomically undone once", async () => {
    const localSession = partialSession();
    await mutateDataset(0, (data) => ({ ...data, sessions: [localSession] }));
    const replaced = await applyImport(
      previewImport(await loadDataset(), createBackup(emptyDataset(), EXPORT), {
        mode: "replace",
      }),
    );
    expect(replaced.sessions).toHaveLength(0);
    expect((await getRecovery())?.dataset.sessions).toHaveLength(1);
    const recovered = await restoreRecovery(replaced.revision);
    expect(recovered.sessions[0].id).toBe(localSession.id);
    expect(await getRecovery()).toBeNull();
    await expect(restoreRecovery(recovered.revision)).rejects.toThrow(
      "no pre-import",
    );
  });
  it("a recovery-copy quota failure aborts the complete import", async () => {
    const original = partialSession();
    await mutateDataset(0, (data) => ({ ...data, sessions: [original] }));
    const preview = previewImport(
      await loadDataset(),
      createBackup(emptyDataset(), EXPORT),
      { mode: "replace" },
    );
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "recovery")
        throw new DOMException("Storage is full", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    });
    await expect(applyImport(preview)).rejects.toThrow("Storage is full");
    vi.restoreAllMocks();
    const after = await loadDataset();
    expect(after.sessions[0].id).toBe(original.id);
    expect(after.revision).toBe(1);
    expect(await getRecovery()).toBeNull();
  });
  it("a failed restoration preserves current records and the recovery copy", async () => {
    await mutateDataset(0, (data) => ({
      ...data,
      sessions: [partialSession()],
    }));
    const replaced = await applyImport(
      previewImport(await loadDataset(), createBackup(emptyDataset(), EXPORT), {
        mode: "replace",
      }),
    );
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (this.name === "sessions")
        throw new DOMException("Storage is full", "QuotaExceededError");
      return key === undefined
        ? put.call(this, value)
        : put.call(this, value, key);
    });
    await expect(restoreRecovery(replaced.revision)).rejects.toThrow(
      "Storage is full",
    );
    vi.restoreAllMocks();
    expect((await loadDataset()).sessions).toHaveLength(0);
    expect((await getRecovery())?.dataset.sessions).toHaveLength(1);
  });
});
