/* eslint-disable @typescript-eslint/no-require-imports -- Node test runner loads existing TypeScript through a local transpiler */
const fs = require("node:fs"),
  path = require("node:path"),
  Module = require("node:module"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
const orig = Module._resolveFilename;
Module._resolveFilename = function (s, p, ...r) {
  return orig.call(
    this,
    s.startsWith("@/") ? path.join(process.cwd(), "src", s.slice(2)) : s,
    p,
    ...r,
  );
};
require.extensions[".ts"] = (m, f) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    f,
  );
const { PGlite } = require("@electric-sql/pglite");
(async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  for (const file of fs.readdirSync("supabase/migrations").sort())
    await db.exec(
      fs
        .readFileSync("supabase/migrations/" + file, "utf8")
        .replace(/^\uFEFF/, ""),
    );
  const a = crypto.randomUUID(),
    b = crypto.randomUUID();
  await db.query("insert into auth.users values($1),($2)", [a, b]);
  async function user(id, role = "authenticated") {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role " + role);
  }
  async function rpc(request) {
    return (
      await db.query("select public.form_mutate($1::jsonb) result", [
        JSON.stringify(request),
      ])
    ).rows[0].result;
  }
  const {
      createDraft,
      transition,
      finalizeDraft,
    } = require("../src/features/workout/machine.ts"),
    { conditioningProgram } = require("../src/programs/catalog.ts");
  let draft = createDraft(
    conditioningProgram,
    0,
    Date.parse("2026-01-01T10:00:00Z"),
    "UTC",
  );
  draft = transition(
    draft,
    { type: "confirm", setId: draft.currentSetId, value: "7" },
    Date.parse("2026-01-01T10:00:05Z"),
  );
  draft = transition(
    draft,
    { type: "end" },
    Date.parse("2026-01-01T10:01:00Z"),
  );
  const session = finalizeDraft(draft);
  const req = {
    mutation_id: crypto.randomUUID(),
    protocol: 2,
    owner: a,
    kind: "session",
    id: session.id,
    expected: null,
    payload: session,
    restore: false,
  };
  await user(a);
  await assert.rejects(() => rpc({ ...req, owner: b }));
  const malformed = structuredClone(session);
  malformed.snapshot.exercises[0].sets[0].target = { type: "unknown" };
  malformed.sets[0].target = { type: "unknown" };
  await assert.rejects(() => rpc({ ...req, payload: malformed }));
  const accepted = await rpc(req);
  assert.equal(accepted.entity.revision, "1");
  assert.deepEqual(await rpc(req), accepted);
  await assert.rejects(() =>
    rpc({ ...req, payload: { ...session, outcome: "completed" } }),
  );
  await assert.rejects(() =>
    db.query("update public.workout_sessions set server_revision=100"),
  );
  await user(b);
  assert.equal(
    (await db.query("select * from public.workout_sessions")).rows.length,
    0,
  );
  const mine = { ...req, owner: b, mutation_id: crypto.randomUUID() };
  assert.equal((await rpc(mine)).entity.revision, "1");
  await user("", "anon");
  await assert.rejects(() => rpc(req));
  await assert.rejects(() => db.query("select * from public.workout_sessions"));
  await user(a);
  const edited = {
    ...session,
    revision: session.revision + 1,
    durationNote: "Correction",
  };
  const change = await rpc({
    ...req,
    mutation_id: crypto.randomUUID(),
    expected: "1",
    payload: edited,
  });
  assert.equal(change.entity.revision, "2");
  assert.equal(
    (await rpc({ ...req, mutation_id: crypto.randomUUID(), expected: "1" }))
      .conflict,
    true,
  );
  assert.deepEqual(await rpc(req), accepted);
  const pull = (await db.query("select public.form_pull('0',null,'') result"))
    .rows[0].result;
  assert.equal(pull.entities.length, 1);
  assert.equal(pull.entities[0].revision, "2");
  assert.equal(
    (await db.query("select public.form_pull('0','0','') result")).rows[0]
      .result.stale,
    true,
  );
  const deleted = await rpc({
    ...req,
    mutation_id: crypto.randomUUID(),
    expected: "2",
    payload: null,
  });
  assert.equal(deleted.entity.payload, null);
  assert.equal(
    (await rpc({ ...req, mutation_id: crypto.randomUUID(), expected: "3" }))
      .conflict,
    true,
  );
  const batch = crypto.randomUUID();
  await db.query("select form_import_begin($1,$2,1,$3)", [batch, "3", a]);
  const op = {
    ...req,
    mutation_id: crypto.randomUUID(),
    expected: "3",
    restore: true,
  };
  const body = JSON.stringify(op),
    checksum = require("crypto")
      .createHash("sha256")
      .update(body)
      .digest("hex");
  await db.query("select form_import_chunk($1,0,0,1,$2,$3,$4)", [
    batch,
    body,
    checksum,
    a,
  ]);
  const imported = (
    await db.query("select form_import_commit($1,$2) result", [batch, a])
  ).rows[0].result;
  assert.equal(imported.committed, true);
  assert.deepEqual(
    (await db.query("select form_import_commit($1,$2) result", [batch, a]))
      .rows[0].result,
    imported,
  );
  if (process.argv.includes("--large")) {
    await user("");
    await db.exec("reset role");
    const largeOwner = crypto.randomUUID();
    await db.query("insert into auth.users values($1)", [largeOwner]);
    await user(largeOwner);
    const largeBatch = crypto.randomUUID();
    await db.query("select form_import_begin($1,$2,$3,$4)", [
      largeBatch,
      "0",
      5000,
      largeOwner,
    ]);
    const began = Date.now();
    for (let i = 0; i < 5000; i++) {
      const data = structuredClone(session);
      data.id = "large-session-" + i;
      data.sets.forEach((set, j) => (set.id = "large-set-" + i + "-" + j));
      const op = {
        ...req,
        owner: largeOwner,
        mutation_id: crypto.randomUUID(),
        id: data.id,
        payload: data,
      };
      const text = JSON.stringify(op),
        sum = require("node:crypto")
          .createHash("sha256")
          .update(text)
          .digest("hex");
      await db.query("select form_import_chunk($1,$2,0,1,$3,$4,$5)", [
        largeBatch,
        i,
        text,
        sum,
        largeOwner,
      ]);
      if ((i + 1) % 1000 === 0)
        console.log("Staged synthetic sessions:", i + 1);
    }
    const stagedAt = Date.now();
    await db.query("select form_import_commit($1,$2)", [
      largeBatch,
      largeOwner,
    ]);
    console.log(
      "Final atomic commit seconds:",
      ((Date.now() - stagedAt) / 1000).toFixed(1),
    );
    let next = "",
      seen = 0,
      head;
    do {
      const page = (
        await db.query("select form_pull($1,$2,$3) result", [
          "0",
          head ?? null,
          next,
        ])
      ).rows[0].result;
      head = page.head;
      seen += page.entities.length;
      next = page.next;
    } while (next);
    assert.equal(seen, 5000);
    console.log(
      "Large PostgreSQL merge and paged pull passed: 5000 sessions / 90000 sets in " +
        ((Date.now() - began) / 1000).toFixed(1) +
        "s",
    );
  }
  await user(a);
  const resumed = (
    await db.query("select form_import_begin($1,$2,1,$3) result", [
      batch,
      "3",
      a,
    ])
  ).rows[0].result;
  assert.equal(resumed.committed, true);
  const forbidden = structuredClone(session);
  forbidden.snapshot.programName = "Silent rewrite";
  await assert.rejects(() =>
    rpc({
      ...req,
      mutation_id: crypto.randomUUID(),
      expected: "4",
      payload: forbidden,
    }),
  );
  await db.close();
  console.log(
    "PostgreSQL tests passed: schemas, RLS, anonymous denial, CAS, idempotency, tombstones, staged import and retry.",
  );
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
