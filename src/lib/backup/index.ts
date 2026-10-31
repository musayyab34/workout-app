import { personalProgramSchema } from "@/domain/programs";
import { canonical as canonicalContent } from "@/features/sync/model";
import { z } from "zod";
import {
  draftSchema,
  preferencesSchema,
  sessionSchema,
  timestampSchema,
  type Dataset,
  type Draft,
  type Session,
} from "@/domain/schemas";
import { assertDataset,assertSession } from "@/domain/invariants";
import { freezeDraftAt } from "@/features/workout/machine";
import {
  loadExportDataset,
  replaceWithRecovery,
} from "@/lib/storage/repository";

export const BACKUP_APP_ID = "personal-fitness-tracker";
export const BACKUP_VERSION = 2;
export const LARGE_FILE_WARNING_BYTES = 25 * 1024 * 1024;

export const backupSchema = z
  .object({
    application: z.literal(BACKUP_APP_ID),
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    programs: z.array(personalProgramSchema).optional(),
    recoveryCandidates: z
      .array(
        z
          .object({
            key: z.string(),
            local: z.unknown().nullable(),
            remote: z.unknown().nullable(),
          })
          .strict(),
      )
      .optional(),
    exportId: z.string().uuid(),
    exportedAt: timestampSchema,
    appVersion: z.string().min(1).max(100),
    preferences: preferencesSchema,
    sessions: z.array(sessionSchema),
    draft: draftSchema.nullable(),
    counts: z
      .object({
        sessions: z.number().int().nonnegative(),
        drafts: z.number().int().min(0).max(1),
        programs: z.number().int().nonnegative().optional(),
        recoveryCandidates: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== "object")
    throw new BackupValidationError(
      "This file is not a fitness-tracker backup.",
    );
  const header = value as Record<string, unknown>;
  if (header.application !== BACKUP_APP_ID)
    throw new BackupValidationError(
      "This file belongs to another application. Choose an exported fitness-tracker JSON backup.",
    );
  if (header.formatVersion !== 1 && header.formatVersion !== BACKUP_VERSION) {
    if (
      typeof header.formatVersion === "number" &&
      header.formatVersion > BACKUP_VERSION
    )
      throw new BackupValidationError(
        "This backup was created by a newer application. Update the tracker before importing it.",
      );
    throw new BackupValidationError(
      "This backup format is unsupported. No records have been changed.",
    );
  }
  const result = backupSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BackupValidationError(
      `Invalid backup at ${issue.path.join(".") || "root"}: ${issue.message}. No records have been changed.`,
    );
  }
  const backup = result.data;
  if (
    backup.formatVersion === 1 &&
    (backup.programs !== undefined ||
      backup.recoveryCandidates !== undefined ||
      backup.counts.programs !== undefined ||
      backup.counts.recoveryCandidates !== undefined ||
      backup.sessions.some((s) => s.snapshot.context) ||
      backup.draft?.snapshot.context)
  )
    throw new BackupValidationError("Version 1 contains unsupported fields.");
  if (
    backup.formatVersion === 2 &&
    (backup.programs === undefined ||
      backup.recoveryCandidates === undefined ||
      backup.counts.programs !== backup.programs.length ||
      backup.counts.recoveryCandidates !== backup.recoveryCandidates.length)
  )
    throw new BackupValidationError(
      "Version 2 programs/recovery counts do not match.",
    );
  if (
    new Set((backup.programs ?? []).map((p) => p.definition.id)).size !==
    (backup.programs ?? []).length
  )
    throw new BackupValidationError("Duplicate program IDs.");
  for (const c of backup.recoveryCandidates ?? [])
    for (const v of [c.local, c.remote])
      if (v !== null) {
        if (c.key.startsWith("session:")) assertSession(sessionSchema.parse(v));
        else if (c.key.startsWith("program:")) personalProgramSchema.parse(v);
        else if (c.key === "preferences:main") preferencesSchema.parse(v);
        else throw new BackupValidationError("Unknown recovery candidate kind");
      }
  if (
    backup.counts.sessions !== backup.sessions.length ||
    backup.counts.drafts !== Number(backup.draft !== null)
  )
    throw new BackupValidationError(
      "Backup record counts do not match its contents.",
    );
  try {
    assertDataset({
      revision: 0,
      sessions: backup.sessions,
      draft: backup.draft,
      preferences: backup.preferences,
    });
    const exported = Date.parse(backup.exportedAt);
    for (const session of [
      ...backup.sessions,
      ...(backup.draft ? [backup.draft] : []),
    ]) {
      for (const timestamp of [
        session.startedAt,
        session.updatedAt,
        session.createdAt,
        session.endedAt,
        ...session.sets.flatMap((set) => [set.recordedAt, set.correctedAt]),
        ...("pause" in session && session.pause
          ? [session.pause.startedAt]
          : []),
        ...("rest" in session && session.rest ? [session.rest.startedAt] : []),
      ]) {
        if (timestamp && Date.parse(timestamp) > exported)
          throw new Error(
            "a record timestamp is later than the export timestamp",
          );
      }
    }
  } catch (error) {
    throw new BackupValidationError(
      `The backup has inconsistent records: ${error instanceof Error ? error.message : "invalid data"}. No records have been changed.`,
    );
  }
  return backup;
}

export function parseBackup(text: string): Backup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupValidationError(
      "The selected file is not valid JSON. Choose an unmodified backup exported by this tracker.",
    );
  }
  return validateBackup(value);
}

/** Capture from an already-consistent read, after the controller flushes pending input. */
export function createBackup(
  dataset: Dataset,
  exportedAt = new Date().toISOString(),
): Backup {
  return validateBackup({
    application: BACKUP_APP_ID,
    formatVersion: BACKUP_VERSION,
    exportId: crypto.randomUUID(),
    exportedAt,
    appVersion: "2.0.0",
    programs: structuredClone(dataset.programs ?? []),
    recoveryCandidates: structuredClone(dataset.recoveryCandidates ?? []),
    preferences: structuredClone(dataset.preferences),
    sessions: structuredClone(dataset.sessions),
    draft: structuredClone(dataset.draft),
    counts: {
      sessions: dataset.sessions.length,
      drafts: Number(dataset.draft !== null),
      programs: (dataset.programs ?? []).length,
      recoveryCandidates: (dataset.recoveryCandidates ?? []).length,
    },
  });
}

export async function captureBackup(): Promise<Backup> {
  return createBackup(await loadExportDataset());
}
export function serializeBackup(backup: Backup): string {
  return JSON.stringify(backup, null, 2);
}

export function backupFilename(at = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `fitness-tracker-backup-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}.json`;
}

/** Caller owns a visible fallback link; release the URL only after it is no longer needed. */
export function createDownload(
  text: string,
  filename = backupFilename(),
): { url: string; filename: string; release: () => void } {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return { url, filename, release: () => URL.revokeObjectURL(url) };
}

export type ImportMode = "merge" | "replace";
export type SessionChoice = "local" | "imported";
export type DraftChoice = "local" | "imported" | "none";
export interface ImportOptions {
  mode: ImportMode;
  sessionChoices?: Record<string, SessionChoice>;
  draftChoice?: DraftChoice;
  applyPreferences?: boolean;
}
export interface SessionConflict {
  id: string;
  local: Session;
  imported: Session;
  choice: SessionChoice;
}
export interface ImportPreview {
  expectedRevision: number;
  mode: ImportMode;
  added: number;
  unchanged: number;
  removed: number;
  conflicts: SessionConflict[];
  preferencesChanged: boolean;
  localDraft: Draft | null;
  importedDraft: Draft | null;
  draftChoice: DraftChoice;
  requiresDraftChoice: boolean;
  draftNormalized: boolean;
  warnings: string[];
  canApply: boolean;
  candidate: Dataset;
  exportedAt: string;
}

export function equivalentSession(a: Session, b: Session): boolean {
  return canonicalContent(a) === canonicalContent(b);
}

export function previewImport(
  local: Dataset,
  backupValue: Backup,
  options: ImportOptions,
): ImportPreview {
  const backup = validateBackup(backupValue);
  assertDataset(local);
  const importedDraft = backup.draft
    ? freezeDraftAt(backup.draft, Date.parse(backup.exportedAt))
    : null;
  const localById = new Map(
    local.sessions.map((session) => [session.id, session]),
  );
  const conflicts: SessionConflict[] = [];
  let added = 0;
  let unchanged = 0;
  const merged = new Map(options.mode === "merge" ? localById : []);
  for (const imported of backup.sessions) {
    const existing = localById.get(imported.id);
    if (!existing) added++;
    else if (equivalentSession(existing, imported)) unchanged++;
    if (options.mode === "replace") {
      merged.set(imported.id, {
        ...structuredClone(imported),
        revision: (existing?.revision ?? 0) + 1,
      });
    } else if (!existing) {
      merged.set(imported.id, structuredClone(imported));
    } else if (!equivalentSession(existing, imported)) {
      const choice = options.sessionChoices?.[imported.id] ?? "local";
      conflicts.push({ id: imported.id, local: existing, imported, choice });
      if (choice === "imported")
        merged.set(imported.id, {
          ...structuredClone(imported),
          revision: existing.revision + 1,
        });
    }
  }
  const draftChoice =
    options.draftChoice ??
    (options.mode === "replace"
      ? importedDraft
        ? "imported"
        : "none"
      : local.draft
        ? "local"
        : importedDraft
          ? "imported"
          : "none");
  const requiresDraftChoice =
    options.mode === "merge" &&
    !!local.draft &&
    !!importedDraft &&
    options.draftChoice === undefined;
  const warnings: string[] = [];
  let draft =
    draftChoice === "local"
      ? structuredClone(local.draft)
      : draftChoice === "imported"
        ? importedDraft
        : null;
  if (draftChoice === "local" && options.mode === "replace") {
    warnings.push(
      "Replacement uses the backup draft or no draft. Select one of those options.",
    );
    draft = null;
  }
  if (draftChoice === "imported" && !importedDraft)
    warnings.push(
      "The backup has no unfinished workout. Choose no draft instead.",
    );
  if (draft && merged.has(draft.id)) {
    warnings.push(
      "The selected unfinished workout already exists in saved history. Choose no draft, or keep a different unfinished workout, before applying.",
    );
    draft = null;
  }
  const preferences =
    options.mode === "replace" || options.applyPreferences
      ? structuredClone(backup.preferences)
      : structuredClone(local.preferences);
  const candidate: Dataset = {
    revision: local.revision,
    sessions: [...merged.values()],
    preferences,
    programs:
      options.mode === "replace"
        ? (backup.programs ?? [])
        : [
            ...new Map([
              ...(backup.programs ?? []).map(
                (p) => [p.definition.id, p] as const,
              ),
              ...(local.programs ?? []).map((p) => {
                const v = personalProgramSchema.parse(p);
                return [v.definition.id, v] as const;
              }),
            ]).values(),
          ],
    recoveryCandidates: [
      ...(options.mode === "replace" ? [] : (local.recoveryCandidates ?? [])),
      ...(backup.recoveryCandidates ?? []),
      ...(backup.programs ?? []).flatMap((p) => {
        const localProgram = (local.programs ?? [])
          .map((x) => personalProgramSchema.parse(x))
          .find((x) => x.definition.id === p.definition.id);
        return localProgram &&
          canonicalContent(localProgram) !== canonicalContent(p)
          ? [
              {
                key: "program:" + p.definition.id,
                local: localProgram,
                remote: p,
              },
            ]
          : [];
      }),
    ],
    draft,
  };
  assertDataset(candidate);
  return {
    expectedRevision: local.revision,
    mode: options.mode,
    added,
    unchanged,
    removed:
      options.mode === "replace"
        ? local.sessions.filter((session) => !merged.has(session.id)).length
        : 0,
    conflicts,
    preferencesChanged:
      JSON.stringify(preferences) !== JSON.stringify(local.preferences),
    localDraft: local.draft,
    importedDraft,
    draftChoice,
    requiresDraftChoice,
    draftNormalized: !!backup.draft && backup.draft.phase !== "review",
    warnings,
    canApply: !requiresDraftChoice && warnings.length === 0,
    candidate,
    exportedAt: backup.exportedAt,
  };
}

export function applyImport(preview: ImportPreview): Promise<Dataset> {
  if (!preview.canApply || preview.requiresDraftChoice)
    return Promise.reject(
      new Error(
        "Resolve the unfinished-workout choices before applying this import.",
      ),
    );
  return replaceWithRecovery(preview.expectedRevision, preview.candidate);
}
