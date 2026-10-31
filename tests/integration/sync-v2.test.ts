import "fake-indexeddb/auto";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { selectWorkspace, closeFitnessDatabase } from "@/lib/storage/db";
import {
  loadDataset,
  mutateDataset,
  readSync,
  updateSession,
} from "@/lib/storage/repository";
import {
  createDraft,
  transition,
  finalizeDraft,
} from "@/features/workout/machine";
import { conditioningProgram } from "@/programs/catalog";
import { synchronize, resolveConflict } from "@/features/sync/engine";
import type { Session } from "@/domain/schemas";
const transport = vi.hoisted(() => ({
  owner: "",
  fail: false,
  lose: false,
  after: undefined as undefined | (() => Promise<void>),
  call: undefined as
    | undefined
    | ((name: string, args: Record<string, unknown>) => Promise<unknown>),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: transport.owner } },
        error: null,
      }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (transport.fail) throw new Error("offline");
      const data = await transport.call!(name, args);
      if (transport.after) {
        const fn = transport.after;
        transport.after = undefined;
        await fn();
      }
      if (transport.lose && name === "form_mutate") {
        transport.lose = false;
        throw new Error("response lost");
      }
      return { data, error: null };
    },
  }),
}));
let db: PGlite;
const owner = crypto.randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;",
  );
  for (const file of readdirSync("supabase/migrations").sort())
    await db.exec(
      readFileSync("supabase/migrations/" + file, "utf8").replace(
        /^\uFEFF/,
        "",
      ),
    );
  await db.query("insert into auth.users values($1)", [owner]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    owner,
  ]);
  await db.exec("set role authenticated");
  transport.owner = owner;
  transport.call = async (name, args) => {
    const names = Object.keys(args);
    return (
      await db.query<{ result: unknown }>(
        "select public." +
          name +
          "(" +
          names.map((n, i) => n + " => $" + (i + 1)).join(",") +
          ") result",
        Object.values(args),
      )
    ).rows[0].result;
  };
}, 30000);
afterAll(async () => {
  await closeFitnessDatabase();
  await db.close();
});
function session(): Session {
  let d = createDraft(conditioningProgram, 0, 1000000000000, "UTC");
  d = transition(
    d,
    { type: "confirm", setId: d.currentSetId!, value: "9" },
    1000000005000,
  );
  d = transition(d, { type: "end" }, 1000000006000);
  return finalizeDraft(d);
}
async function workspace(name: string) {
  await selectWorkspace("test-v2:" + name, true);
}
async function append(s: Session) {
  const d = await loadDataset();
  await mutateDataset(d.revision, (d) => ({
    ...d,
    sessions: [...d.sessions, s],
  }));
}
it("keeps confirmed local history and frozen outbox through offline and lost acknowledgement; another workspace converges", async () => {
  await workspace("a");
  const s = session();
  await append(s);
  transport.fail = true;
  await expect(synchronize(owner)).rejects.toThrow("offline");
  expect((await loadDataset()).sessions).toEqual([s]);
  transport.fail = false;
  transport.lose = true;
  await expect(synchronize(owner)).rejects.toThrow("response lost");
  const pending = (await readSync()).pending[0].request!;
  await synchronize(owner);
  expect((await readSync()).pending).toHaveLength(0);
  expect((await readSync()).bases["session:" + s.id].revision).toBe("1");
  expect(pending.mutation_id).toBeTruthy();
  await workspace("b");
  await synchronize(owner);
  expect((await loadDataset()).sessions).toEqual([s]);
}, 30000);
it("preserves both concurrent corrections until explicit resolution", async () => {
  await workspace("a");
  const s = (await loadDataset()).sessions[0];
  await updateSession((await loadDataset()).revision, {
    ...s,
    durationNote: "A correction",
  });
  await synchronize(owner);
  await workspace("b");
  await updateSession((await loadDataset()).revision, {
    ...s,
    durationNote: "B correction",
  });
  await synchronize(owner);
  const state = await readSync();
  expect(state.conflicts["session:" + s.id].local).toMatchObject({
    durationNote: "B correction",
  });
  expect(state.conflicts["session:" + s.id].remote.payload).toMatchObject({
    durationNote: "A correction",
  });
  await resolveConflict("session:" + s.id, "cloud");
  await synchronize(owner);
  expect((await loadDataset()).sessions[0].durationNote).toBe("A correction");
  expect((await loadDataset()).recoveryCandidates).toHaveLength(1);
}, 30000);
it("does not let an older acknowledgement overwrite a successor edit", async () => {
  await workspace("successor");
  const s = session();
  await append(s);
  transport.after = async () => {
    const d = await loadDataset();
    await updateSession(d.revision, {
      ...s,
      durationNote: "typed while upload in flight",
    });
  };
  await synchronize(owner);
  expect(
    (await loadDataset()).sessions.find((x) => x.id === s.id)?.durationNote,
  ).toBe("typed while upload in flight");
  expect((await readSync()).bases["session:" + s.id].revision).toBe("2");
  expect((await readSync()).pending).toHaveLength(0);
}, 30000);
it("stops stale work after workspace generation changes", async () => {
  await workspace("old");
  await append(session());
  transport.after = async () => {
    await workspace("new-account");
  };
  await expect(synchronize(owner)).rejects.toThrow("Account changed");
  expect((await loadDataset()).sessions).toHaveLength(0);
  expect((await readSync()).pending).toHaveLength(0);
}, 30000);
