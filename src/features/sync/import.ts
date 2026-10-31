import { cloudMerge, synchronize } from "./engine";
import { readSync, loadDataset, mutateDataset } from "@/lib/storage/repository";
import { openFitnessDatabase, workspaceGeneration } from "@/lib/storage/db";
import { canonical, type Request } from "./model";
import { personalProgramSchema } from "@/domain/programs";
import type { ImportPreview } from "@/lib/backup";
import type { Dataset } from "@/domain/schemas";
type Journal = {
  batch: string;
  head: string;
  operations: Request[];
  candidate: Dataset;
  before: Dataset;
  generation: number;
};
export async function applyAccountImport(
  preview: ImportPreview,
  owner: string,
  allowRestore = false,
) {
  if (preview.mode !== "merge" || !preview.canApply)
    throw new Error("Only a validated merge may be uploaded.");
  if (await (await openFitnessDatabase()).get("metadata", "cloudImport"))
    return recoverAccountImport(owner);
  const before = await loadDataset();
  if (before.revision !== preview.expectedRevision)
    throw new Error("Import preview is stale.");
  const s = await readSync();
  if (s.pending.length || Object.keys(s.conflicts).length)
    throw new Error(
      "Finish synchronization and resolve conflicts before importing.",
    );
  const operations: Request[] = [];
  const add = (kind: Request["kind"], id: string, payload: unknown) => {
    const key = kind + ":" + id;
    const base = s.bases[key];
    if (base?.payload === null && !allowRestore)
      throw new Error(
        "This backup contains a deleted account record. Restore it explicitly before importing.",
      );
    if (canonical(base?.payload ?? null) !== canonical(payload))
      operations.push({
        protocol: 2,
        owner,
        mutation_id: crypto.randomUUID(),
        kind,
        id,
        payload,
        expected: base?.revision ?? null,
        restore: base?.payload === null && allowRestore,
      });
  };
  for (const session of preview.candidate.sessions)
    add("session", session.id, session);
  for (const p of preview.candidate.programs ?? []) {
    const v = personalProgramSchema.parse(p);
    add("program", v.definition.id, v);
  }
  add("preferences", "main", preview.candidate.preferences);
  const journal: Journal = {
    batch: crypto.randomUUID(),
    head: s.cursor,
    operations,
    candidate: preview.candidate,
    before,
    generation: workspaceGeneration,
  };
  const db = await openFitnessDatabase();
  if (journal.generation !== workspaceGeneration)
    throw new Error("Account changed; reopen this import.");
  const tx = db.transaction(["metadata", "recovery"], "readwrite");
  await tx
    .objectStore("recovery")
    .put(
      { capturedAt: new Date().toISOString(), dataset: before },
      "before-import",
    );
  await tx.objectStore("metadata").put(journal, "cloudImport");
  await tx.done;
  return recoverAccountImport(owner);
}
export async function recoverAccountImport(owner: string) {
  const db = await openFitnessDatabase();
  const journal = (await db.get("metadata", "cloudImport")) as
    Journal | undefined;
  if (!journal) return;
  const generation = workspaceGeneration;
  await cloudMerge(journal.operations, journal.head, journal.batch, owner);
  if (generation !== workspaceGeneration)
    throw new Error("Sign into the original account to finish importing.");
  const d = await loadDataset();
  await mutateDataset(
    d.revision,
    () => journal.candidate,
    true,
    undefined,
    generation,
  );
  await db.delete("metadata", "cloudImport");
  await synchronize(owner);
  return loadDataset();
}

export async function cancelAccountImport(owner: string) {
  const db = await openFitnessDatabase();
  const journal = (await db.get("metadata", "cloudImport")) as
    Journal | undefined;
  if (!journal) return;
  const { supabase } = await import("@/lib/supabase/client");
  const { data, error } = await supabase().rpc("form_import_cancel", {
    batch: journal.batch,
    intended_owner: owner,
  });
  if (error) throw new Error(error.message);
  if (data.committed) return recoverAccountImport(owner);
  if (data.canceled) await db.delete("metadata", "cloudImport");
}
