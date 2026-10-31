import { accountWorkspace, workspaceGeneration } from "./db";
import { canonical, emptySync, type SyncState } from "@/features/sync/model";
import { personalProgramSchema } from "@/domain/programs";
import type { IDBPTransaction } from "idb";
import {
  defaultPreferences,
  type Dataset,
  type Draft,
  type Preferences,
  type Session,
} from "@/domain/schemas";
import { validateDataset } from "@/domain/invariants";
import {
  openFitnessDatabase,
  readRawDatabase,
  type FitnessDatabase,
} from "./db";

const DATA_STORES = [
  "sessions",
  "drafts",
  "preferences",
  "metadata",
  "recovery",
] as const;
type DataTransaction = IDBPTransaction<
  FitnessDatabase,
  (typeof DATA_STORES)[number][],
  "readonly" | "readwrite"
>;
type WriteTransaction = IDBPTransaction<
  FitnessDatabase,
  (typeof DATA_STORES)[number][],
  "readwrite"
>;

export class StaleRevisionError extends Error {
  constructor() {
    super(
      "Another tab changed your data. The latest saved state has been loaded; review it before trying again.",
    );
    this.name = "StaleRevisionError";
  }
}
export class StoredDataError extends Error {
  constructor(message: string) {
    super(
      `Saved data could not be opened safely: ${message}. Export the raw records for recovery; do not clear site data.`,
    );
    this.name = "StoredDataError";
  }
}

function validated(value: unknown): Dataset {
  const d = validateDataset(value);
  for (const p of d.programs ?? []) personalProgramSchema.parse(p);
  return d;
}

async function readData(tx: DataTransaction): Promise<Dataset> {
  const [sessions, draft, preferences, revision, schema] = await Promise.all([
    tx.objectStore("sessions").getAll(),
    tx.objectStore("drafts").get("active"),
    tx.objectStore("preferences").get("main"),
    tx.objectStore("metadata").get("revision"),
    tx.objectStore("metadata").get("schemaVersion"),
  ]);
  if (schema !== undefined && schema !== 1)
    throw new StoredDataError("unsupported data version");
  try {
    return validated({
      revision: revision ?? 0,
      sessions,
      draft: draft ?? null,
      preferences: preferences ?? defaultPreferences,
      ...((await tx.objectStore("metadata").get("programs"))
        ? { programs: await tx.objectStore("metadata").get("programs") }
        : {}),
      ...((await tx.objectStore("metadata").get("recoveryCandidates"))
        ? {
            recoveryCandidates: await tx
              .objectStore("metadata")
              .get("recoveryCandidates"),
          }
        : {}),
    });
  } catch (error) {
    throw new StoredDataError(
      error instanceof Error ? error.message : "invalid records",
    );
  }
}

async function writeData(
  tx: WriteTransaction,
  current: Dataset,
  next: Dataset,
): Promise<void> {
  for (const p of next.programs ?? []) personalProgramSchema.parse(p);
  await tx.objectStore("metadata").put(next.programs ?? [], "programs");
  await tx
    .objectStore("metadata")
    .put(next.recoveryCandidates ?? [], "recoveryCandidates");
  const sessionStore = tx.objectStore("sessions");
  const previous = new Map(
    current.sessions.map((session) => [session.id, session]),
  );
  const retained = new Set(next.sessions.map((session) => session.id));
  const writes: Promise<unknown>[] = [];
  for (const session of next.sessions) {
    const before = previous.get(session.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(session))
      writes.push(sessionStore.put(session, session.id));
  }
  for (const session of current.sessions)
    if (!retained.has(session.id)) writes.push(sessionStore.delete(session.id));
  writes.push(
    next.draft
      ? tx.objectStore("drafts").put(next.draft, "active")
      : tx.objectStore("drafts").delete("active"),
  );
  writes.push(tx.objectStore("preferences").put(next.preferences, "main"));
  writes.push(tx.objectStore("metadata").put(next.revision, "revision"));
  writes.push(tx.objectStore("metadata").put(1, "schemaVersion"));
  await Promise.all(writes);
}

export async function loadDataset(): Promise<Dataset> {
  const db = await openFitnessDatabase();
  const tx = db.transaction([...DATA_STORES], "readonly");
  try {
    const data = await readData(tx);
    await tx.done;
    return data;
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/** The callback must be synchronous. Validation and writes occur in the same CAS transaction. */
export async function mutateDataset(
  expectedRevision: number,
  updater: (current: Dataset) => Dataset,
  remote = false,
  updateSync?: (state: SyncState) => void,
  expectedWorkspace = workspaceGeneration,
): Promise<Dataset> {
  if (expectedWorkspace !== workspaceGeneration)
    throw new Error("Workspace changed");
  const isAccount = accountWorkspace;
  const db = await openFitnessDatabase();
  if (expectedWorkspace !== workspaceGeneration)
    throw new Error("Workspace changed");
  const tx = db.transaction([...DATA_STORES], "readwrite");
  try {
    const current = await readData(tx);
    if (
      isAccount &&
      !remote &&
      (await tx.objectStore("metadata").get("cloudImport"))
    )
      throw new Error(
        "Resume the pending account import before changing this workspace.",
      );
    if (current.revision !== expectedRevision) throw new StaleRevisionError();
    const result = updater(structuredClone(current));
    const next = validated({ ...result, revision: current.revision + 1 });
    if (isAccount) {
      const state =
        ((await tx.objectStore("metadata").get("sync")) as
          SyncState | undefined) ?? emptySync();
      if (!remote) enqueueChanges(state, current, next);
      updateSync?.(state);
      await tx.objectStore("metadata").put(state, "sync");
    }
    await writeData(tx, current, next);
    await tx.done;
    if (isAccount && !remote && typeof window !== "undefined")
      window.dispatchEvent(new Event("form-local-change"));
    return next;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Already aborted/complete. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export function saveDraft(
  expectedRevision: number,
  draft: Draft | null,
): Promise<Dataset> {
  return mutateDataset(expectedRevision, (data) => {
    if (draft && data.draft && draft.id !== data.draft.id)
      throw new Error(
        "Resume, end, or discard the current unfinished workout before starting another.",
      );
    return { ...data, draft };
  });
}
export async function finalizeSession(
  expectedRevision: number,
  session: Session,
): Promise<Dataset> {
  const existing = await loadDataset();
  if (
    !existing.draft &&
    existing.sessions.some((entry) => entry.id === session.id)
  )
    return existing;
  return mutateDataset(expectedRevision, (data) => {
    if (
      !data.draft ||
      data.draft.id !== session.id ||
      data.draft.phase !== "review"
    )
      throw new Error("This workout is not ready to save.");
    if (data.sessions.some((entry) => entry.id === session.id))
      throw new Error("This workout has already been saved.");
    return { ...data, sessions: [...data.sessions, session], draft: null };
  });
}
export function updateSession(
  expectedRevision: number,
  session: Session,
): Promise<Dataset> {
  return mutateDataset(expectedRevision, (data) => {
    const original = data.sessions.find((entry) => entry.id === session.id);
    if (!original) throw new Error("This session is no longer on this device.");
    if (JSON.stringify(original.snapshot) !== JSON.stringify(session.snapshot))
      throw new Error("Historical workout prescriptions cannot be edited.");
    return {
      ...data,
      sessions: data.sessions.map((entry) =>
        entry.id === session.id
          ? { ...session, revision: entry.revision + 1 }
          : entry,
      ),
    };
  });
}
export function deleteSession(
  expectedRevision: number,
  id: string,
): Promise<Dataset> {
  return mutateDataset(expectedRevision, (data) => ({
    ...data,
    sessions: data.sessions.filter((session) => session.id !== id),
  }));
}
export function updatePreferences(
  expectedRevision: number,
  preferences: Preferences,
): Promise<Dataset> {
  return mutateDataset(expectedRevision, (data) => ({ ...data, preferences }));
}

export interface RecoverySnapshot {
  capturedAt: string;
  dataset: Dataset;
}
export async function getRecovery(): Promise<RecoverySnapshot | null> {
  const db = await openFitnessDatabase();
  const raw = await db.get("recovery", "before-import");
  if (!raw) return null;
  if (
    typeof raw !== "object" ||
    !("capturedAt" in raw) ||
    !("dataset" in raw) ||
    typeof raw.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(raw.capturedAt))
  ) {
    throw new Error(
      "The pre-import recovery copy is damaged. Download your current records before continuing.",
    );
  }
  return { capturedAt: raw.capturedAt, dataset: validated(raw.dataset) };
}

/** Candidate was fully validated in preview; validation is repeated before the transaction. */
export async function replaceWithRecovery(
  expectedRevision: number,
  candidate: Dataset,
  capturedAt = new Date().toISOString(),
): Promise<Dataset> {
  if (accountWorkspace)
    throw new Error(
      "Account imports require the reviewed cloud merge. Use Account → Import to account.",
    );
  const proposed = validated(candidate);
  const db = await openFitnessDatabase();
  const tx = db.transaction([...DATA_STORES], "readwrite");
  try {
    const current = await readData(tx);
    if (current.revision !== expectedRevision) throw new StaleRevisionError();
    if (
      current.draft &&
      current.draft.phase !== "paused" &&
      current.draft.phase !== "review"
    )
      throw new Error(
        "Pause the unfinished workout and refresh the import preview before applying it.",
      );
    const next = { ...proposed, revision: current.revision + 1 };
    await tx
      .objectStore("recovery")
      .put({ capturedAt, dataset: current }, "before-import");
    await writeData(tx, current, next);
    await tx.done;
    return next;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Transaction already inactive. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export async function restoreRecovery(
  expectedRevision: number,
): Promise<Dataset> {
  if (accountWorkspace)
    throw new Error(
      "Export recovery and use a reviewed account merge; cloud replacement is unavailable.",
    );
  const db = await openFitnessDatabase();
  const tx = db.transaction([...DATA_STORES], "readwrite");
  try {
    const current = await readData(tx);
    if (current.revision !== expectedRevision) throw new StaleRevisionError();
    const raw = (await tx.objectStore("recovery").get("before-import")) as
      RecoverySnapshot | undefined;
    if (!raw)
      throw new Error("There is no pre-import recovery copy on this device.");
    const next = validated({ ...raw.dataset, revision: current.revision + 1 });
    await writeData(tx, current, next);
    await tx.objectStore("recovery").delete("before-import");
    await tx.done;
    return next;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* Transaction already inactive. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}

export function rawExport(): Promise<Record<string, unknown>> {
  return readRawDatabase();
}
export async function recordExportRequest(
  timestamp = new Date().toISOString(),
): Promise<void> {
  const db = await openFitnessDatabase();
  await db.put("metadata", timestamp, "lastExportRequest");
}
export async function getLastExportRequest(): Promise<string | null> {
  const db = await openFitnessDatabase();
  const value = await db.get("metadata", "lastExportRequest");
  return typeof value === "string" ? value : null;
}

function entities(d: Dataset): Record<string, unknown> {
  return Object.fromEntries([
    ...d.sessions.map((s) => ["session:" + s.id, s] as const),
    ...(d.programs ?? []).map((p) => {
      const x = personalProgramSchema.parse(p);
      return ["program:" + x.definition.id, x] as const;
    }),
    ["preferences:main", d.preferences],
  ]);
}
function enqueueChanges(state: SyncState, before: Dataset, after: Dataset) {
  const a = entities(before),
    b = entities(after);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (canonical(a[key] ?? null) === canonical(b[key] ?? null)) continue;
    const pending = state.pending.filter((p) => p.key === key);
    if (
      b[key] === undefined &&
      !state.bases[key] &&
      pending.every((p) => !p.request)
    ) {
      state.pending = state.pending.filter((p) => p.key !== key);
      continue;
    }
    const last = pending.at(-1);
    if (last && !last.request) last.payload = b[key] ?? null;
    else state.pending.push({ key, payload: b[key] ?? null });
  }
}
export async function readSync(): Promise<SyncState> {
  return (
    ((await (await openFitnessDatabase()).get("metadata", "sync")) as
      SyncState | undefined) ?? emptySync()
  );
}
export async function syncEdit(
  edit: (d: Dataset, s: SyncState) => Dataset,
): Promise<Dataset> {
  const generation = workspaceGeneration;
  const d = await loadDataset();
  const state = await readSync();
  return mutateDataset(
    d.revision,
    (current) => edit(current, state),
    true,
    (s) => {
      Object.assign(s, state);
    },
    generation,
  );
}
export function setEntity(
  d: Dataset,
  key: string,
  payload: unknown | null,
): Dataset {
  const [kind, ...ids] = key.split(":");
  const id = ids.join(":");
  if (kind === "session")
    return {
      ...d,
      sessions: [
        ...d.sessions.filter((s) => s.id !== id),
        ...(payload ? [payload as Session] : []),
      ],
    };
  if (kind === "program")
    return {
      ...d,
      programs: [
        ...(d.programs ?? []).filter(
          (p) => personalProgramSchema.parse(p).definition.id !== id,
        ),
        ...(payload ? [personalProgramSchema.parse(payload)] : []),
      ],
    };
  if (!payload) throw new Error("Preferences cannot be deleted");
  return { ...d, preferences: payload as Preferences };
}
export function saveProgram(expected: number, value: unknown) {
  const p = personalProgramSchema.parse(value);
  return mutateDataset(expected, (d) => ({
    ...d,
    programs: [
      ...(d.programs ?? []).filter(
        (x) => personalProgramSchema.parse(x).definition.id !== p.definition.id,
      ),
      p,
    ],
  }));
}

export async function loadExportDataset(): Promise<Dataset> {
  const db = await openFitnessDatabase();
  const tx = db.transaction([...DATA_STORES], "readonly");
  const d = await readData(tx);
  const s = (await tx.objectStore("metadata").get("sync")) as
    SyncState | undefined;
  await tx.done;
  if (!s) return d;
  const candidates = [
    ...(d.recoveryCandidates ?? []),
    ...Object.values(s.conflicts).map((c) => ({
      key: c.key,
      local: c.local,
      remote: c.remote.payload,
    })),
    ...s.pending
      .filter((p) => p.payload === null)
      .map((p) => ({
        key: p.key,
        local: s.bases[p.key]?.payload ?? null,
        remote: null,
      })),
  ];
  return {
    ...d,
    recoveryCandidates: Array.from(
      new Map(candidates.map((c) => [canonical(c), c])).values(),
    ),
  };
}
