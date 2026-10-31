import { supabase } from "@/lib/supabase/client";
import { readSync, syncEdit, setEntity } from "@/lib/storage/repository";
import { openFitnessDatabase, workspaceGeneration } from "@/lib/storage/db";
import { canonical, type Entity, type Kind } from "./model";
import { assertSession } from "@/domain/invariants";
import { personalProgramSchema } from "@/domain/programs";
import { preferencesSchema, type Session } from "@/domain/schemas";
export function validateEntity(e: Entity) {
  if (!e.payload) return;
  if (e.kind === "session") assertSession(e.payload as Session);
  else if (e.kind === "program") personalProgramSchema.parse(e.payload);
  else preferencesSchema.parse(e.payload);
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export async function synchronize(owner: string) {
  const generation = workspaceGeneration;
  const guard = async () => {
    if (generation !== workspaceGeneration)
      throw new Error("Account changed; synchronization stopped.");
    const { data, error } = await supabase().auth.getUser();
    if (error || data.user?.id !== owner)
      throw new Error("Sign in again to sync.");
  };
  await guard();
  if (await (await openFitnessDatabase()).get("metadata", "cloudImport"))
    throw new Error(
      "Resume the interrupted account import before synchronizing.",
    );
  for (let i = 0; i < 10000; i++) {
    const state = await readSync();
    const p = state.pending.find((p) => !state.conflicts[p.key]);
    if (!p) break;
    if (!p.request)
      await syncEdit((d, s) => {
        const entry = s.pending.find((x) => x.key === p.key && !x.request);
        if (entry) {
          const [kind, ...ids] = entry.key.split(":");
          entry.request = {
            protocol: 2,
            owner,
            mutation_id: crypto.randomUUID(),
            kind: kind as Kind,
            id: ids.join(":"),
            expected: s.bases[entry.key]?.revision ?? null,
            payload: entry.payload,
            restore:
              !!s.bases[entry.key] &&
              !s.bases[entry.key].payload &&
              !!entry.payload,
          };
        }
        return d;
      });
    const current = (await readSync()).pending.find((x) => x.key === p.key);
    if (!current?.request) continue;
    await guard();
    const result = await rpc("form_mutate", { request: current.request });
    await guard();
    const remote = result.entity as Entity;
    validateEntity(remote);
    await syncEdit((d, s) => {
      const index = s.pending.findIndex(
        (x) => x.request?.mutation_id === current.request!.mutation_id,
      );
      if (index < 0) return d;
      if (result.conflict) {
        s.conflicts[p.key] = {
          key: p.key,
          base: s.bases[p.key],
          local:
            s.pending.filter((x) => x.key === p.key).at(-1)?.payload ?? null,
          remote,
        };
        return d;
      }
      s.pending.splice(index, 1);
      s.bases[p.key] = remote;
      return d;
    });
  }
  const state = await readSync();
  let h: string | undefined;
  let after = "";
  const entities: Entity[] = [];
  for (;;) {
    await guard();
    const page = await rpc("form_pull", {
      since: state.cursor,
      expected_head: h ?? null,
      after_key: after,
    });
    await guard();
    if (page.stale)
      throw new Error("Another device updated the account; retry sync.");
    h = page.head;
    for (const e of page.entities as Entity[]) {
      validateEntity(e);
      entities.push(e);
    }
    if (!page.next) break;
    after = page.next;
  }
  await syncEdit((d, s) => {
    for (const e of entities) {
      const key = e.kind + ":" + e.id;
      const pending = s.pending.filter((p) => p.key === key);
      if (pending.length) {
        const local = pending.at(-1)!.payload;
        if (canonical(local) === canonical(e.payload)) {
          s.pending = s.pending.filter((p) => p.key !== key);
          delete s.conflicts[key];
          s.bases[key] = e;
        } else if (e.revision !== s.bases[key]?.revision)
          s.conflicts[key] = { key, base: s.bases[key], local, remote: e };
      } else {
        if (e.kind === "session" && d.draft?.id === e.id)
          throw new Error(
            "A saved cloud session matches this local unfinished workout. Export it before resolving the duplicate.",
          );
        d = setEntity(d, key, e.payload);
        s.bases[key] = e;
      }
    }
    s.cursor = h!;
    s.lastSync = new Date().toISOString();
    return d;
  });
}
export async function resolveConflict(key: string, choice: "local" | "cloud") {
  return syncEdit((d, s) => {
    const c = s.conflicts[key];
    if (!c) throw new Error("Conflict has changed. Refresh.");
    d = {
      ...d,
      recoveryCandidates: [
        ...(d.recoveryCandidates ?? []),
        { key, local: c.local, remote: c.remote.payload },
      ],
    };
    s.pending = s.pending.filter((p) => p.key !== key);
    s.bases[key] = c.remote;
    delete s.conflicts[key];
    if (choice === "local") s.pending.push({ key, payload: c.local });
    else d = setEntity(d, key, c.remote.payload);
    return d;
  });
}
export async function cloudMerge(
  operations: unknown[],
  expectedHead: string,
  batch: string,
  owner: string,
) {
  const gen = workspaceGeneration;
  const check = () => {
    if (gen !== workspaceGeneration)
      throw new Error(
        "Account changed; recover this import after signing back in.",
      );
  };
  check();
  const begun = await rpc("form_import_begin", {
    batch,
    intended_owner: owner,
    head: expectedHead,
    item_count: operations.length,
  });
  if (begun?.committed) return begun;
  for (let i = 0; i < operations.length; i++) {
    const text = JSON.stringify(operations[i]);
    const characters = Array.from(text);
    const chunks = Array.from(
      { length: Math.ceil(characters.length / 30000) },
      (_, n) => characters.slice(n * 30000, (n + 1) * 30000).join(""),
    );
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text),
    );
    const checksum = Array.from(new Uint8Array(bytes), (x) =>
      x.toString(16).padStart(2, "0"),
    ).join("");
    for (let n = 0; n < chunks.length; n++) {
      check();
      await rpc("form_import_chunk", {
        batch,
        intended_owner: owner,
        item: i,
        fragment: n,
        total: chunks.length,
        body: chunks[n],
        checksum,
      });
    }
  }
  check();
  const result = await rpc("form_import_commit", {
    batch,
    intended_owner: owner,
  });
  check();
  return result;
}
