# FORM version 2 — Accounts, safe synchronization, and editable programs

**Status:** Reviewed implementation blueprint; planning only. No version 2 application code, database, account, or deployment has been created by this planning task.

**Revision:** 2.0, 29 October 2026.

**Authority:** This plan extends [version 1](IMPLEMENTATION_PLAN.md). Its explicit changes supersede the version 1 exclusions of accounts, hosted data, synchronization, and custom programs. All unchanged recording, timer, accessibility, correction, and historical-data requirements remain binding. The original plan is an unchanged historical artifact, including its original status text.

Read this entire document, the [setup guide](SUPABASE_SETUP.md), and the existing code before implementation. The user will separately authorize Sol to implement it. Do not create accounts, upload personal data, apply hosted migrations, deploy, commit, or push solely because this plan exists.

## 1. Outcome and scope

The user can sign into the same account on a phone and computer and see the same saved workout history, statistics, and personal program definitions. A friend can register a separate account and gets their own data. The existing workout must survive migration with its identity and complete content intact. Editing a routine affects future sessions; it never changes prescriptions embedded in earlier sessions or an unfinished workout.

### Approved decisions

- Supabase provides email/password authentication and PostgreSQL. Keep Next.js, TypeScript, Tailwind, IndexedDB, idb, Zod, and the existing workout engine.
- **The user explicitly chose to keep unfinished workouts on their starting device.** No live cross-device recording, draft synchronization, automatic handoff, or distributed workout lease. Each browser/account workspace may have one draft. Two devices can independently record different sessions; both saved sessions subsequently synchronize.
- Keep an optional local workspace. Authentication is required for cloud synchronization, not for access to an existing local backup or recovery tools. With no Supabase configuration, the local app remains usable and clearly says cloud sync is unavailable.
- Persist confirmed actions locally before advancing. Saving history commits the completed/partial session and its pending upload together. Network failure must never undo a completed set or erase a saved session.
- Synchronize saved sessions, personal program definitions (including archived programs), and the three existing preferences. Charts remain derived. Drafts, in-progress editor forms, local recovery copies, auth credentials, and sync journals are not portable cloud records.
- Use explicit revision conflicts, never timestamp-based last-writer-wins. Preserve both sides of a conflict until the user chooses.
- Use the existing data structures as versioned JSONB documents, with relational owner/identity/revision columns. Do not normalize every set into a SQL row or introduce a general synchronization framework.
- Use foreground polling and focus/reconnect/manual refresh. Supabase Realtime, subscriptions, cron, queues, and Edge Functions are unnecessary for this release.
- Keep one template per executable program. The editor covers every currently usable prescription field; it does not introduce weighted sets, distance, time-based targets, supersets, scheduling, social sharing, or AI coaching.
- Keep the exact mentor program as an immutable bundled baseline. A user can edit a private override of it under the same program ID, preserving the history grouping. Other accounts and the bundled baseline are unaffected.
- Account imports use **reviewed merge**, not account-wide replacement. Local-workspace replacement and its atomic recovery remain available. Cloud-wide replacement/undo is deliberately excluded because an apparently local restore must not erase changes from every device. Signed-in UI must explain this difference; do not retain a misleading Replace account button.

### Explicit limits

An already loaded page can record during a connection outage. Offline loading/reloading, background synchronization with the browser closed, background timer alarms, and encrypted local caches are not promised. An unfinished workout or pending upload can still be lost if its device storage is cleared before export/sync. Show this honestly. Supabase sync supplements downloadable backups; it does not guarantee zero loss under every infrastructure or device failure.

Do not add a profiles table, public user directory, admin UI, shared-program permissions, OAuth, payments, avatar uploads, or analytics. Account deletion can be handled through the project owner's documented administrative process in this release; do not request a powerful runtime service key just to add an unrequested admin feature.

## 2. Baseline audit and protected migration input

The existing app is a working Next.js 16 App Router application. It has strict schemas and semantic invariants, a pure workout machine, a revision-checked IndexedDB repository, validated v1 backups, and tests. Extend those boundaries instead of rebuilding the app.

Concrete integration points discovered during review:

| Existing area | Required change |
|---|---|
| `src/domain/schemas.ts`, `invariants.ts` | Add explicit v2 program/snapshot and backup schemas; retain a real v1 reader |
| `src/lib/storage/db.ts`, `repository.ts` | Workspace isolation, non-destructive legacy migration, sync metadata and outbox transactions |
| `src/features/workout/provider.tsx` | Bind commands to a workspace/auth generation, preserve serialized input saves, surface local/cloud status separately |
| `src/programs/catalog.ts` | Resolve immutable defaults plus personal overrides/new programs; avoid mutating module constants |
| `src/components/program-screen.tsx` | Remove hardcoded six-exercise/eighteen-set badge and first-set-only target display |
| `src/app/programs/[programId]/page.tsx` | Resolve private programs after workspace initialization; distinguish loading from missing |
| `src/features/statistics/index.ts` and charts | Include personal/archived programs, distinguish changed prescriptions and repeated movement entries |
| `src/lib/backup/index.ts`, Settings | v1/v2 import, private migration, portable programs, conflict preservation, account merge semantics |

### The user's real backup

Original external file: `C:/Users/musay/Downloads/fitness-tracker-backup-2026-10-29-1108.json`.

A byte-identical safety copy exists locally at `.private/backups/fitness-tracker-backup-2026-10-29-1108.json`. The `.private/` directory is Git-ignored. It is not distributed in a clone or deployment. A private verification manifest lives beside the copy. Read it when testing on this machine. If absent on another machine, implement and test using synthetic fixtures, then report that the owner's actual migration verification remains outstanding.

During planning, the file successfully passed **the existing application's `parseBackup` function**, including schema, counts, references, and semantic invariants. It contains one completed session with 18 recorded sets and no draft. Preserve the stored calendar dates, not an interpretation of the conversational word “yesterday.” Do not embed this user's personal JSON, workout values, identifiers, or account details into tracked test fixtures, SQL seeds, static pages, or logs.

Migration must preserve session and set IDs, exercise entries, ordering, names/instructions, target variants, actuals including zero, statuses, timestamps, captured time zone/date keys, outcome, original/calculated/corrected durations and notes, and preference values. Server versions and local concurrency counters are separate transport metadata. Preserve the source domain revision during an unchanged import; never treat it as a cloud version.

New sessions get new IDs; they append to the existing history. They do not use a baseline total, recreate yesterday as a synthetic result, or restart statistics. No default user account is preloaded with the owner's workout.

## 3. Product flows and presentation

Preserve the existing dark charcoal/mint visual language, mobile navigation, large workout controls, and accessible dialogs. Add straightforward forms and status explanations rather than a new dashboard aesthetic.

| Screen | Behavior |
|---|---|
| Sign in / register | Email/password, show password control, confirmation notice, resend with cooldown, generic account errors |
| Forgot / reset password | Request email, handle expired/reused links, allow a new password after verified recovery |
| Settings: Account | Current account, local/cloud workspace identity, last successful sync, pending/conflict counts, Sync now, sign out |
| First sign-in migration | Show signed-in email and local-data summary; choose reviewed upload or keep local data separate |
| Home | Existing summary and programs, Create program, per-program Edit/Duplicate/Archive, local draft banner |
| Program editor | Program fields, ordered exercise cards, per-set targets, review/save, local form recovery |
| Sync review | Readable local/cloud differences, explicit choice, export conflicting versions |
| History/detail | Saved locally vs synced badge, pending deletion/conflict explanation, original snapshot and normal corrections |

Routes may follow `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/confirm`, `/programs/new`, `/programs/[programId]/edit`, and `/settings/sync`. Keep existing routes. Never create programs, sessions, or uploads just by opening a route.

Display distinguishable states: **Saving on device**, **Saved on this device — waiting to sync**, **Syncing**, **Synced**, **Offline — showing saved data**, **Sign in again to sync**, **Conflict needs review**, and **Sync failed — Retry**. A green Synced state requires acknowledged writes and a successfully applied pull, with no unresolved conflict or pending operation. A timeout is an unknown outcome, not proof that the server rejected a write.

Do not flash empty history during auth/cache/pull initialization. Initial hydration from cloud must finish all pages before presenting a complete dataset or complete statistics. Previously cached history may display with an explicit updating/stale label.

Starting a workout uses the latest committed local program snapshot. A pending local program edit may be used, labeled not yet synced. If its cloud version conflicts, preserve the already-started snapshot. Recovery guidance can only use the history known to this device; do not imply knowledge of unsynced activity elsewhere.

## 4. Authentication and account isolation

Use current stable `@supabase/supabase-js` and `@supabase/ssr`, compatible with the installed Next.js version. Do not replace the existing scaffold or opportunistically upgrade unrelated packages. Pin resolved versions and retain the lockfile. Follow the official cookie-based Next.js pattern, using `src/proxy.ts` for Next.js 16. Verify authentication on the server where server authorization is needed; never use an unverified `getSession()` value as an authorization decision. Authenticated responses and token-refresh responses must not enter shared caches. [Official SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs).

Enable email/password with email confirmation. Supabase stores passwords; the application does not. Registration, confirmation, login, resend, forgotten password, password reset, logout, and token expiry must work. Use generic reset/sign-up responses where appropriate to avoid account enumeration. Preserve the email address input on errors and never log passwords or tokens. [Password auth](https://supabase.com/docs/guides/auth/passwords).

Use `/auth/confirm` with server-side token-hash verification for signup and recovery links. Accept only the expected token types, route successful signup to Home and recovery to Reset password, remove tokens from the URL, and use fixed internal destinations. Reject arbitrary external `next` values. Test links opened in another browser/device, expired links, resend, and auth redirects. The setup guide defines matching email templates.

Account identity is the authenticated Supabase user UUID, never email or a caller-provided owner ID. A friend receives a fresh namespace; never auto-copy another person's cache because the browser is shared.

### Workspace lifecycle

- Isolate local databases by Supabase project and authenticated user ID, plus an explicit guest workspace. Suggested names: `fitness-tracker-v2:local` and `fitness-tracker-v2:<project-ref>:<user-id>`. Names are not encryption or a security boundary against somebody using browser developer tools.
- On account changes, cancel timers/subscriptions/network work, invalidate the old auth/workspace generation, close its repository, clear React state/forms, then load the next scope. Every async result and queued command checks its originating generation and owner before applying.
- Recheck authenticated identity before sending an outbox request. A delayed request from account A must never be sent with account B's session. The same rule applies to acknowledgements, import previews, and editor saves.
- Auth expiry during a workout must not erase it. Keep recording in its existing local scope while indicating that sync needs sign-in. Do not silently relabel it as guest or attach it to the next login.
- Sign out flushes input, pauses an active workout, then hides account data and cancels sync. Default: retain recoverable local account data, accessible through the app after signing back into that same account. Explain shared-device limitations. An optional Remove saved data from this device action must require no pending writes/draft/conflict, or a deliberate export-and-discard confirmation with exact counts. Never clear storage as an incidental logout step.
- Keep the guest workspace separate after sign-in. An explicit migration preview is required to upload it. Subsequent new guest records do not inherit an old consent marker.

Do not persist auth tokens in backup files or IndexedDB workout documents. Sign-out/auth events must propagate to other open tabs. BroadcastChannel may speed refresh; transaction and owner checks remain the correctness mechanism.

## 5. Database and server contract

### Data layout

Use a small set of owner-scoped tables. SQL identifiers below are the implementation contract unless a documented equivalent is needed.

| Table | Content and keys |
|---|---|
| `account_sync_state` | One row per `owner_id`; monotonically increasing account `change_version`; initialized safely on first authorized use |
| `workout_sessions` | PK `(owner_id, id)`; `id` is text to retain all valid v1 identifiers; versioned JSONB session payload; `server_revision`; `change_version`; server timestamps; `deleted_at` tombstone |
| `workout_programs` | PK `(owner_id, id)`; versioned personal definition/override JSONB; same revision/change metadata; archived state inside the document |
| `account_preferences` | One row per owner; the existing validated preferences; same revision/change metadata |
| `sync_mutations` | PK `(owner_id, mutation_id)`; server-computed request fingerprint and bounded receipt including accepted entity revisions; idempotent retries |
| `import_batches`, `import_items` | Private staged account merge; owner/batch/item identity, canonical contents, expected versions and account version; not visible as workouts until committed |

Do not add a foreign key from a saved session to a current program. Historical/unknown programs and older versions remain displayable from snapshots. `owner_id` references `auth.users`; deletion of an auth user cascades their account rows, including receipts and staging. No runtime service-role key is needed for normal app operation.

The JSON domain payload does not contain trusted ownership. Keep `payload_version`, `server_revision`, and `change_version` outside it. Preserve existing session `createdAt`/`updatedAt`; server receipt timestamps are additional fields, not replacements. Serialize PostgreSQL bigint revisions as decimal strings over JSON and compare exactly; do not round through JavaScript Number. Never resolve conflicts by a device's date/time. Define canonical equality explicitly: compare all domain fields after recursive object-key ordering, excluding only the local `revision` counter; array order and timestamps remain significant. Thus two edits with equal reps but different correction timestamps can still need review. Transport wrappers are not part of domain equality. Unknown fields are not silently discarded.

Indexes: owner + change version for incremental pulls; owner + ID for identity/CAS; owner + session start date if used for server listing. Derive any indexed date from the validated payload rather than accepting conflicting client copies. Unique identity and revision checks must also hold when several tabs/devices initialize at once.

### Access and validation

Enable RLS for all application tables. Authenticated users can select only their own records, with `auth.uid()` non-null. No anonymous workout reads/writes and no policy using unrestricted `true`. Revoke direct table INSERT/UPDATE/DELETE from browser roles so clients cannot bypass revision checks, tombstones, or mutation receipts. Explicit grants are required; SQL-created objects must not rely on dashboard defaults. [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [API grants](https://supabase.com/docs/guides/api/securing-your-api).

Use narrowly scoped PostgreSQL RPCs for writes and consistent reads, invoked with the logged-in user's token and public publishable key. Most application validation stays shared TypeScript; SQL validators also enforce persisted document shape, allowed fields/versions, numeric bounds, IDs, set references/order, target/result consistency, saved-session completeness, outcome, valid timestamps/date ranges, duration consistency, and program invariants. An authenticated client can call an RPC outside the UI, so client Zod validation alone is insufficient. Exercise these validators with the same valid/invalid fixture corpus. Do not execute imported SQL/HTML or interpolate dynamic SQL from JSON.

For write functions that need revoked table privileges, use a narrowly scoped `SECURITY DEFINER` with fixed empty `search_path`, fully qualified objects, no arbitrary SQL, explicit `auth.uid()` ownership on **every** query, and EXECUTE granted only to authenticated users. Revoke EXECUTE from PUBLIC/anon. Internal helpers are not externally executable. Prefer invoker for simple RLS-protected reads. Document why definer is necessary and test direct REST/RPC attacks as user A, user B, and anonymous. Do not trust RLS to protect a definer function from its own missing owner predicate. [Database functions](https://supabase.com/docs/guides/database/functions).

All entry points must enforce contract versions. Unknown newer payloads stop synchronization with an update message while preserving local state and pending writes. A stale v1/v2 client cannot rewrite fields it does not understand.

### Atomic mutation RPC

An operation contains a fresh `mutation_id`, protocol version, entity kind/ID, action, expected server revision (null means create), and complete validated candidate payload or explicit delete/restore intent. Owner is obtained on the server. New program IDs and mutation IDs use UUIDs; retain v1 text IDs.

Within one PostgreSQL transaction:

1. Authenticate; initialize and lock this user's `account_sync_state` row. All their mutation/import commit paths take this lock in the same order.
2. Check an existing receipt for this mutation ID. Identical request returns the original accepted result; different content with the same ID is rejected. A retry does not reapply its change after later edits.
3. Validate the request and current entity. Require exact expected server revision. An insert with an existing ID is equivalent/no-op only if its semantic content matches; otherwise return conflict. Never use blind upsert.
4. Enforce account-level semantic constraints, including duplicate set-instance IDs across saved sessions; serialize this check under the account lock. ID collisions are explicit conflicts, not automatic ID rewrites.
5. Write a complete entity, increment its server revision and the account change version, and store the receipt in the same transaction. Deletions retain a tombstone and a recoverable payload; restoring a tombstone needs explicit user intent and its current revision.
6. Return accepted revisions and canonical data or enough receipt information to fetch it. Any error rolls back all writes and the receipt.

Idempotency receipts and tombstones are retained in v2; no age-based cleanup that lets a very old offline device resurrect data. A later retention policy requires an epoch/full-refresh design and is outside this release. No event-sourcing history is required.

### Incremental pull without skipped rows

Do not use `updated_at > last_sync_time`, offset pagination of changing rows, or a plain global sequence as a commit-order guarantee.

Use account change versions assigned while holding the account row lock. For each pull pass, obtain account version H. Fetch a deterministic keyset page of entities/tombstones with `cursor < change_version <= H`, including entity kind and ID to break ties within a batch. Every page verifies the account is still H using a single SQL statement snapshot (for example a read-only STABLE SQL RPC), or an explicitly repeatable snapshot. Several statements at ordinary READ COMMITTED isolation are not sufficient. If it changed, discard the staged pass and retry; never advance the durable cursor across an incomplete/invalid page set. Latest-row storage is sufficient because an unchanged H makes the pass stable.

Apply the complete staged pass and new cursor in one IndexedDB transaction, checking the local workspace generation and dataset revision. Preserve dirty entities as described below. Empty pages must not hide a service/API row limit: use explicit page sizes (for example 200 records), continuation tokens, and a final completion marker. Initial pull is the same protocol from zero. At 5,000 sessions, test multiple pages, concurrent commits, deletes, and a network failure on a middle page. A busy account can briefly retry; do not replace the user's cache with a half-loaded account.

Do not fetch each deleted session's full retained payload in ordinary pulls: send an identity/revision tombstone and retrieve the retained document only for authorized conflict/recovery review. Pending creates/deletes remain governed by the same CAS rules. Missing preferences on a fresh account mean the default values with expected revision null; do not generate duplicate initialization writes just by rendering Settings.

## 6. Local persistence and sync worker

Keep local dataset CAS and the existing serialized workout command queue. Separate three independent versions: local dataset revision, local session revision, server entity revision. A domain revision of 80 is not a server revision of 80.

Each workspace has domain stores plus `sync_meta`, `outbox`, `conflicts`, local editor drafts, import/migration state, and recovery. The exact store split may be simplified where atomicity remains obvious. Do not store one giant account JSON document in a single Supabase row.

### Local write contract

- An ordinary saved-entity mutation atomically saves the candidate, its known server base/revision, and pending outbox entry. Only then update the UI. A finalized workout writes history + outbox + removes its draft in the same local transaction.
- Draft saves and timer events stay entirely local. A pull, preference update, program edit, or session deletion never replaces an active workout snapshot, pointer, input, or timer.
- A new entity uses expected revision null. An existing entity uses its last acknowledged/fetched server revision, not its local revision. Keep the base payload for conflict comparison.
- Entries not yet sent may be coalesced for the same entity while retaining the original server base. Before first network transmission, persist an immutable request/mutation ID. Never change a request once it might have reached the server.
- If a new local edit happens while that request is in flight, retain it as a successor. On acknowledgement, store the new server base and rebase only that successor onto the acknowledged version; do not replace its newer local content. A concurrent remote edit will still fail CAS.
- If create then delete happens before anything was sent, coalesce it away locally. If creation might have reached the server, resolve its receipt before issuing a tombstone. Never assume aborting fetch undoes a commit.

Persist outbox state changes with CAS too. Multiple tabs may transmit the same frozen request; server idempotency makes this harmless. They cannot freeze two differing requests for the same queue generation. No tab-leader election or heartbeat is required.

### Scheduling and failure

Sync after local saved-entity changes, successful login, reconnect, focus/visibility return, and manual Sync now. When visible and signed in, poll approximately every 30 seconds, only one pass per controller at a time. Skip unnecessary polls when hidden. Use bounded exponential retry with jitter for transient network/service errors. `navigator.onLine` is only a hint. Do not retry invalid data or conflicts forever. Handle rate limits and auth refresh once before requiring sign-in again.

Cloud preferences update defaults, not an existing workout's copied rest setting. Synced sound/vibration preferences never bypass browser gesture/permission requirements or replay a missed alert on another device.

Recommended pass: resolve frozen requests/receipts, pull stable remote state, reconcile dirty entries, send eligible operations, then pull again to confirm convergence. Recheck workspace generation before each application. Preserve error details without logging personal payloads. Stop cleanly when switching account or unloading.

If the server commits but local acknowledgement storage fails, keep the frozen outbox request. Retrying returns its receipt. If the local save failed, nothing should have been sent. A server outage shows pending state and permits local recording; it never starts an empty guest account silently.

### Conflict policy

| Situation | Result |
|---|---|
| Remote changed; local clean | Apply remote validated document/tombstone |
| Local dirty; remote still equals local base | Keep local candidate; upload with expected revision |
| Both changed to semantically equal content | Reconcile metadata as equivalent; no duplicate record |
| Both changed differently | Store base/local/remote and revisions; block only that entity's upload |
| Remote delete vs local edit | Conflict; never automatically recreate it |
| Local delete vs remote edit | Conflict; never silently delete the remote correction |
| Duplicate session ID with different content | Conflict; do not auto-copy under a new ID |

Show the actual differences, including set results/dates/durations or program fields. Choices: Use cloud, Keep my version, or Review later. Offer downloading both candidates before a choice. Keep my version creates a new request against the latest reviewed server revision; if the server changes again, review again. Use cloud discards the pending edit only after recording a local recovery copy of the rejected candidate. Do not auto-merge individual sets in v2. Program and preferences conflicts use the same rules.

Unresolved sessions count once in statistics, using the visible local candidate, with a warning that devices may differ until resolved. Pending deletion is hidden from totals but discoverable in Sync review. Conflict alternatives are not extra workouts. Clean synced records contribute normally.

## 7. Safe legacy and backup migration

### Legacy browser storage

Version 1 uses database `fitness-tracker`, version 1. Preserve it as the migration source; do not clear it or rename IDs. Block old tabs before migration and use a version upgrade to close v1 connections and prevent old code reopening at version 1. Leave all original user record values intact. A v1 application rollback cannot simply read this newer database version; document recovery by export, not blind downgrade.

Copy validated data into the new guest workspace in one destination transaction, with source revision/fingerprint and a completion marker. Cross-database operations are not one transaction: keep the source untouched and make the copy idempotent. A crash before the destination commit repeats safely; a crash after commit detects the marker. Quota, corruption, unsupported schema, or blocked upgrade stops migration and offers raw/export recovery, without resetting either source.

Read legacy pre-import recovery as well as current sessions/preferences/draft. Preserve that recovery in the new guest scope with its format tag; do not silently drop the user's existing recovery copy. New personal programs initially use bundled defaults. Never contact Supabase during a local schema migration.

### Claiming existing data for an account

1. Require a verified signed-in account and show its email. Offer Export current local data first. Never claim data at registration merely because the browser contains it.
2. Pull the complete destination account. Finish existing uploads and resolve destination sync conflicts before preparing an account import; if offline or blocked, offer export and keep the selected file available without making a preview that ignores pending work. Validate the complete source (guest dataset or selected file), then preview additions/equivalents/conflicts. Source may be the protected backup or a newer export; do not assume the older supplied file contains later workouts.
3. Preserve IDs and compare canonical user content. Ignore local concurrency counters for equivalence. Do not deduplicate by date/exercise totals. Same ID with different data needs explicit choice, defaulting to keeping the existing account record. A tombstoned ID requires explicit restoration, never silent resurrection from an old backup.
4. Preferences default to keeping existing account choices; allow explicit use of source preferences. For an empty account, offer adopting source preferences. A source draft is copied only to this device's destination workspace after preview, frozen at a consistent capture/export time with the existing import rules; it never goes to Supabase. If a destination draft exists, require Keep destination or Use source explicitly, after flush/pause; preserve the displaced draft in local recovery. Check a source draft ID against cloud saved/tombstoned sessions before adoption: an equivalent saved session means no resumable draft, while differing content needs review. Never let a local draft overwrite a saved session sharing its ID.
5. Bind preview to source/destination local revisions, owner, auth generation, and cloud account version. Recheck at commit. Save a local pre-migration recovery snapshot and a durable operation journal before network writes.
6. Stage and commit the reviewed account merge through section 8. Retain the source workspace/file unchanged. After success, pull/read back all migrated IDs and verify semantic equality (except explicitly selected resolutions and documented draft normalization). Record a private migration receipt.
7. Refresh a second browser/device signed into the same account and verify history/detail/statistics. Reimporting the original file must add zero duplicates. Add a later synthetic/new session and confirm the historical session remains unchanged. Only then mark the owner's migration verified.

The running website cannot read the owner's Downloads path automatically. Its onboarding uses a normal file picker or the old origin's browser storage. A local agent may read the explicitly provided file for validation, but must not bake it into the bundle or automatically upload it to an unconfirmed account.

## 8. Backups, large imports, and recovery

Keep format 1 readable with the existing strict schema and a tested in-memory upgrade. Emit format 2 for v2 exports. V1 sessions/snapshots remain representable exactly; added optional v2 snapshot metadata must not overwrite old values. Separate IndexedDB version, backup format version, RPC protocol version, payload schema version, and program content versions.

V2 backup includes application/format/export metadata, all visible saved sessions, personal programs/overrides including archived entries, preferences, and this device's optional draft. It also includes a typed `recoveryCandidates` section for unresolved local/cloud conflict alternatives and pending-delete payloads, so an export does not silently discard either version. Include explicit counts for each section. Those alternatives remain quarantined recovery items when imported until the user resolves them; they never become duplicate workouts or automatic uploads.

Do not export auth tokens, account access keys, trusted owner IDs, server revisions as portable authority, mutation receipts/outbox commands, cache cursors, or private email. Export pending ordinary session/program edits as their visible user content. Export downloaded records plus any pending local records in a consistent local transaction after flushing input.

An export during incomplete cloud bootstrap is labeled **This device's available data**, not Full account backup. For Full account export, first complete a successful pull; report outstanding uploads/conflicts and include their recoverable content. Offline exports stay available. A file cannot include another device's unsynced workout or draft, and the UI must say so.

### Import modes

- Guest/local: retain merge, replace, one atomic pre-import recovery snapshot, explicit draft choice and normalization. Add programs and recovery candidates to the same atomic transaction. Unknown v1 programs remain historical unless the user explicitly creates a new program from them.
- Signed-in: validated account merge only. Show that accepted changes propagate to other devices. Explicitly select conflicts/preferences/draft; no cloud deletion implied by records absent from a backup. Offer export first. A local recovery restore must not replay old outbox receipts or silently replace cloud records; restored content requires a new reviewed merge.
- Entire file schema/semantic validation occurs before any domain data mutation. Newer unsupported formats are refused. Preserve >25 MiB caution without a hard size cap; allocation/transport/quota errors leave prior records unchanged and explain what remains pending.

### Atomic cloud merge without oversized HTTP requests

Do not send a 5,000-session backup through one Vercel function request or use per-row upserts that leave a half-imported account.

Use authenticated Supabase RPCs directly for staging bounded chunks (target at most 256 KiB of encoded request body, accounting for JSON escaping). A batch stores owner, client batch ID, protocol, expected account version, declared item counts, and reviewed operations. Prefer whole documents; a larger valid document uses numbered text fragments in `import_items` with declared total fragments and a server-verified checksum, assembled and parsed before validation/commit. Chunk identity/content is immutable and idempotent. Do not impose a 256 KiB document limit that prevents importing the app's own valid exports. A single unusually large normal mutation can use this same staged path rather than exceeding the tested API request limit.

Staging rows have the same ownership enforcement and cannot appear in history queries. Final commit verifies all items, fragment completeness, uniqueness, schemas, expected account version and entity revisions under the account lock, then applies the entire merge and receipt in one SQL transaction. Assign one account change version to the batch, with kind/ID pagination tie-breakers. Missing/malformed/conflicting items abort all domain changes. Memory/database timeouts remain possible: retain source/journal and report failure without partial domain imports. Profile and test the 5,000-session case before setting a justified bounded RPC timeout; do not disable timeouts globally.

The client durably records batch ID before transmission. A lost response is recovered by querying/retrying the same batch, not starting a second import. Freeze preview during commit; a stale preview is rebuilt rather than accepted. Cancel before commit may discard staging. Once commit may have happened, determine its outcome before offering cancellation or a new preview. Failed/abandoned staging can be removed explicitly or by owner-scoped opportunistic cleanup after 30 days; never remove committed idempotency receipts. No cron or storage bucket needed.

Local recovery/journal commits happen before cloud commit. Cloud and IndexedDB cannot commit atomically together: if server commit succeeds and local application fails, retain the journal and recover by receipt + pull. Do not report rollback or ask the user to reimport blindly. The source file and pre-import recovery remain available. While an import owns the local workspace, block competing local writes; other devices may still mutate, causing a safe stale preview error. Apply local draft/preference choices after confirmed server outcome using the journal.

A recovery snapshot does not automatically undo a cloud import. To reverse one, export current data and make reviewed corrective changes; account-wide undo is deferred. This is an intentional change from local-only replace, not an implementation omission.

## 9. Program editor and versioning

### Persisted shape

Use a concrete `UserProgramDocument` rather than unspecified arbitrary form JSON: `{ kind: "bundled-override" | "custom", archived: boolean, definition: ProgramV2 }`. The table/backup envelope supplies its payload version. `ProgramV2` retains program `id`, read-only `slug`, positive integer `version`, `name`, `description`, `guidance`, nullable `referenceUrl`, and exactly one template for executable definitions. Its availability is active; archived is separate from Coming Soon. New slugs equal the generated ID; preserve the original baseline slug. The only bundled-override ID supported initially is `beginner-conditioning`; reject attempts to claim arbitrary bundled content as a mentor override.

The template retains `id`, positive integer `version`, `name`, and ordered exercises. Its `defaultRestSeconds` is now an explicit integer 0–900 or null (inherit account default). Adapt the immutable v1 bundled template to null for the effective baseline, because v1 actually used the user preference at Start. Do not edit the original bundled prescription to achieve this. Exercise and prescription structures retain existing fields/IDs and supported target variants; authoring UI limits below are separate from legacy-history validation. System Coming Soon descriptors stay outside user executable definitions.

New session snapshots may add one optional `context` object: `{ programDescription, guidance, referenceUrl, templateName, source: "bundled" | "personalized" | "custom" }`, with the same text/URL validation. V1 snapshot objects without context remain unchanged and valid. V1 backup parsing remains strict against the original format; v2 parsing/migration explicitly selects the supported snapshot variant rather than silently dropping fields.

### Fields and controls

| Level | Editable controls |
|---|---|
| Program | Name, description/notes, ordered guidance text, optional program reference URL, active/archive state |
| Single routine/template | Routine name; optional rest default override, otherwise use account default |
| Exercise entry | Name, technique/instruction notes, movement identity/variant choice, position, add/remove |
| Sets | Add/remove, sequential set count, reorder where meaningful, per-set target type and value/instruction; apply one target to all sets convenience |
| Target | Fixed repetitions (1–10,000), submaximal instruction, or until-muscular-burning instruction |

Recording remains actual repetitions from 0–10,000. Target numbers never become prefilled actual results. Qualitative targets have no hidden numeric placeholder. No new recording kinds or per-set rest override in this release. `instructions` is the exercise notes field; do not create an unexplained second notes field. Existing duration correction notes and skip notes retain their result-editing roles, not prescription-editing roles.

Name fields: trimmed, 1–200 characters. Description/instructions/guidance/qualitative target text: up to 4,000 per field; qualitative instructions must be nonblank. Optional reference URL: HTTP(S) only, no embedded credentials; render text safely and open with `noopener noreferrer`. Maximum 2,048 characters for newly authored URLs. No HTML/markdown execution. Authoring limits: 1–50 exercises, 1–50 sets per exercise, at most 250 sets total, at most 20 guidance items. These are UI/creation safeguards, not instructions to truncate old/imported valid history. A legacy document outside editor limits remains viewable/exportable; ask the user to reduce its new definition deliberately before publishing an edited copy.

Rest default precedence: explicit Start screen choice, else personal routine override, else synced account preference, initially 90 seconds. Snapshot the resolved rest in the draft as now. Existing baseline has no effective override, preserving v1 preference behavior. Changes affect future rests/sessions only under the existing engine rules. Do not accidentally turn the old template's unused default field into a new override on migration.

### Identity and comparisons

- Program ID and template ID are stable within an edited program. Increment program/template content versions once per saved content change; no-op saves do not increment. Server revision is separate. Conflicting saves must re-version the chosen definition against the latest accepted version. Existing snapshots are not renumbered. Two disconnected devices can temporarily publish different local definitions with the same numeric version. Their full snapshots remain authoritative; label unsynced versions and compare actual prescription content, never assume equal numeric versions imply equal definitions.
- Existing exercise-entry IDs and prescription-set IDs survive reorder/ordinary edits. Generate IDs only for new entries/sets, never from array position or mutable names. Renumber `setNumber` in display order and validate uniqueness.
- `exerciseId` means comparable movement identity, distinct from occurrence/entry ID. Name/instruction corrections may keep it. Replacing normal push-ups with a different variation must offer a clearly labeled New movement/variant that generates a new identity; never infer equality merely from matching names.
- Adding an exercise offers a simple search of bundled movements and movements already in this user's definitions, plus Create new movement. Selecting one copies editable fields while retaining its movement ID. No separate global exercise library service/table is needed.
- Repeated entries of the same movement are allowed. Charts must let the user select an entry/occurrence for Set 1 and full-entry totals; do not choose whichever `setNumber: 1` happens to be found first. Best-set movement view may aggregate all matching entries, explicitly labeled. Legacy single-entry behavior remains unchanged.
- Different set counts change the meaning of full-exercise totals. Show version/set count/target annotations and group best-full-entry records by comparable entry + prescribed set count; do not declare a larger total solely from adding sets to be an unqualified new record. Best-set comparisons can span target changes for the same movement.

### Editing bundled and personal programs

Editing Beginner Running Conditioning creates/updates only the current workspace/account's override at `beginner-conditioning`. Retain its template ID and unchanged movement identities so old and new sessions appear under the same program. Label edited versions **Personalized**; never label new user instructions as the mentor's original prescription. The original six-exercise, 18-set baseline and its guidance remain accessible through View original.

Restore original is a reviewed new program revision, not deletion of history or resetting versions to 1. It restores exactly the bundled order/targets/instructions; current draft is unaffected. Duplicate creates a separate UUID program/template and fresh entry/set IDs, retaining comparable movement identities. New program from scratch also uses UUID IDs. Display slugs are not authorization or identity.

Archive hides a program from default start choices and prevents starting it from its detail page; it keeps history, statistics filters, definition, and draft recovery. Allow unarchive. Use archive instead of hard deletion in v2. Bundled Coming Soon placeholders remain informational; the user may create their own program, but the app must not invent a pull-up prescription to fill them.

Save is an explicit local durable action plus outbox change. Use a pre-save review showing added/removed/reordered exercises and changed set targets. Warn that it changes future workouts only. Keep recoverable editor scratch state per program and workspace with its base revision; reload offers Restore draft or Discard. Do not autosave every keystroke as a published program version. Discard restores the last committed definition. Program conflicts preserve the scratch/candidate content. Decreasing set counts or removing an exercise requires confirmation in the form; nothing in existing sessions is deleted.

### Snapshot and guidance changes

Extend new snapshots to include the context actually shown at Start: program description, program guidance, program reference URL, routine name, and personalized/source marker, as versioned optional additions. Existing snapshots lacking those fields remain valid and are not reconstructed from today's edited catalog. Continue storing every exercise name/instruction and per-set target as before. Current workout and history never dereference mutable definitions for their prescription.

The exact baseline keeps its recovery warnings and approximate weekly goal. For its same-ID personal override, keep the separately labeled original mentor recovery reminder and goal even when the user changes their personal guidance text; editing notes must not silently switch a safety rule. Custom/duplicated programs do not automatically inherit the running mentor's three-per-week target or recovery claim. Preserve generic consistency counts without an invented numerical goal. Do not build a parser that tries to derive medical advice from free-text guidance.

## 10. Statistics and history integrity

Reuse existing selectors and known-answer tests. The complete visible saved-session dataset is the source of totals, not a new reset counter. Retain completed/partial distinctions, capped per-set fixed-target attainment, qualitative exclusions, explicit zeros, captured date keys, duration correction labels, and deterministic ordering.

The baseline override shares the original program ID, so the user's first workout remains in that program's progress. Duplicate/new programs have separate program filters. Removed/archived movements remain selectable from historical snapshots. Program/exercise names in old session detail remain their old names. Current filter labels can show the latest name with an indication of prior names.

All components must derive exercise/set counts and target summaries from the selected definition/snapshot. Mixed per-set targets display their actual sequence, not only the first target. Preserve no-final-rest and all variable-length engine behavior. Test one exercise/one set, mixed target types, repeated movements, added/removed sets, all qualitative targets, and archived programs with an active draft.

## 11. Module boundaries and implementation sequence

Suggested additions: `src/lib/supabase/{client,server}.ts`, `src/proxy.ts`, `src/features/auth`, `src/features/sync`, `src/features/programs`, workspace-aware storage helpers, auth/editor/sync review routes, and `supabase/{config.toml,migrations,tests}`. Keep functions specific to this app. No ORM, external sync engine, general event bus, state framework, or chart replacement.

| Milestone | Deliverable and acceptance |
|---|---|
| 1. Baseline protection | Read plans/code; run current checks in the correct OS environment; validate private backup if available; add synthetic preservation fixtures; workspace/schema migration keeps original data and recovery intact |
| 2. Auth and isolation | Full email/password lifecycle; correct cookie/proxy handling; guest/account switching and expiry cannot expose or reassign another account's records |
| 3. Supabase contract | Versioned SQL migrations, RLS/grants, document validators, locked CAS/idempotent mutations, stable paged reads, real database security tests |
| 4. Synchronization | Atomic local outbox, retries, conflicts/tombstones, account-safe async handling, honest status; two independent browsers converge after offline recording |
| 5. Migration and backups | v1/v2 validation, reviewed guest/file claim, staged atomic merge, local recovery, round-trip; repeat import produces zero duplicates; real private input preserved where available |
| 6. Editable programs | Complete editor, override/duplicate/archive/restore, stable identity/versioning, preserved snapshots, variable-length workouts and updated statistics |
| 7. Experience and resilience | Mobile/auth/editor/conflict states, account switch races, quota/storage/server failures, migration crash recovery, large-dataset/payload limits verified |
| 8. Release evidence | Full release gate, setup guide reconciled to actual code, `.env.example`, checked migrations, private migration verification report, concise deviations/remaining limitations |

Integrate vertical slices; do not finish with an isolated login page, a database schema without sync, or an editor whose changes never reach workouts. Dependency ordering may overlap, but all acceptance conditions must be satisfied.

## 12. Required verification

### Preserve the existing guarantees

Run typecheck, lint, all unit/integration/component tests, production build, and production-browser tests. Keep meaningful v1 tests; update assumptions intentionally where v2 changes scope. No test bypass because a feature became harder with authentication. Existing reported baseline was 80 unit/integration/component tests and 13 browser workflows; confirm actual current results instead of assuming those still pass.

### Critical new tests

1. Migrate a nonempty v1 IndexedDB database with a draft and a recovery snapshot; crash/quota/blocked-upgrade paths do not clear source data. A completed migration rerun is idempotent.
2. Import a v1 fixture; compare every domain field/set before and after local migration, cloud read-back, second-device pull, and v2 re-export. Validate the actual owner's private file locally if present, without committing or logging its contents.
3. Two independent browser contexts, same account: create/save offline on A, reconnect, see it on B; two different new sessions both survive; no duplicate after lost acknowledgements/reload.
4. Two accounts plus anonymous: direct SELECT, INSERT/UPDATE/DELETE, guessed IDs, owner spoofing, RPCs, staging/receipts, and account switching reveal or alter no other user's rows. Test actual Supabase/Postgres, not only mocked SDK calls.
5. Same entity edited differently on A and B; both candidates survive; manual resolution CAS rechecks; equivalent edits do not create a conflict. Test edit/delete, delete/offline-create, tombstone reimport, program and preferences conflicts.
6. Save succeeded remotely but response lost; reload/retry same mutation yields one write. Local acknowledgement quota failure is recoverable. New edit while upload is in flight survives an older acknowledgement. Two tabs transmitting a frozen request are harmless.
7. Switch/sign out during a pending pull/upload/import/form save. No A data enters B storage or UI, including late responses. Auth expiry during an active workout preserves all confirmed sets and recoverable input.
8. Pull over several pages while another device commits; no skipped rows, premature cursor advancement, missing tombstones, or false complete statistics. Include default API pagination limits.
9. Account merge: invalid file/chunk, missing chunk, stale preview, mismatched batch reuse, network failure, quota before/after cloud commit, duplicate reimport, canceled preview, and unresolved draft choice. Domain rows are either all committed or unchanged.
10. Editor reorder/add/remove/variable set targets, fixed vs qualitative, zero actuals, duplicate movement entries, identity-changing variants, archive/unarchive, restore baseline, abandoned/recovered form, same-program two-device conflict. Old sessions and active draft remain byte-equivalent in their domain fields.
11. Backups preserve pending edits, conflict alternatives and pending-delete payloads; account export completeness is labeled; restore never replays trusted owner IDs, revisions or old outbox operations.
12. Auth confirmation/recovery in another browser, invalid/expired links, resend throttling, sign-out, inaccessible SMTP, password reset, and no private response caching.
13. A 5,000-session/90,000-set synthetic account: paged bootstrap, chunked import, export, statistics, and responsive navigation; measure against actual transport limits. Never use the owner's real account for destructive load tests.

Use local Supabase with its supported container runtime (normally Docker Desktop with WSL integration on this machine) for reproducible SQL/auth tests and synthetic data. A dedicated hosted development project is an alternative if the local stack is unavailable; it is not permission to mutate production. SQL migrations must be exercised from an empty database and from the previous schema version. Generate/check database types from the tested schema.

Verify 320/390/768/1440 px, keyboard and focus, no horizontal overflow, clear conflict/draft warnings, and no hydration/runtime errors. Real iOS/Android, background behavior and email delivery on actual devices require manual checks; report unperformed checks honestly. Cloud sync cannot be marked release-ready solely on mocked tests when real RLS/RPC/auth verification was unavailable.

## 13. Rollout and maintenance

Follow [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Implementation supplies exact migration files and tested commands; this planning task creates none. Use a separate development project/local stack for tests. Production imports happen only after the user signs into the intended account and confirms the reviewed upload. Never use a public SQL seed to migrate the owner.

Apply additive migrations before releasing dependent application code, verify the protocol version gate, then configure Vercel and deploy when authorized. Preserve downloaded backups and the previous app release. A code rollback does not undo schema or client-storage migration; unsupported older clients must fail safely rather than overwrite new data.

README must describe actual implemented behavior, environment variables, commands, migrations, auth email configuration, local-only drafts, pending-upload risks, conflict resolution, account isolation, export completeness, account-merge-only behavior, and measured verification. Do not leave the existing README claim that no cloud data/auth exists after v2 ships. Keep plan documents as historical specifications and record material deviations explicitly.

Review provider quotas, inactive-project behavior, and backup coverage before relying on hosting. Keep periodic independent JSON exports. Paid Supabase plans have managed backup features; do not describe a free project as guaranteed point-in-time recovery. [Backup documentation](https://supabase.com/docs/guides/platform/backups).

## 14. Complexity and ambiguity review

The design intentionally avoids live draft handoff, realtime subscriptions, normalized per-set SQL rows, service-role runtime keys, profiles/social features, global exercise-library CRUD, and cloud-wide replace/undo. These are not required to meet the user's chosen scope.

The outbox, idempotency receipts, tombstones, stable pagination, per-account isolation, and staged imports are retained because removing them creates specific data-loss or cross-account failure modes. Keep their implementations small and tested; do not replace them with an untested sync dependency.

Resolved ambiguities: saved sessions vs drafts; source vs destination account ownership; mentor baseline vs personal edits; movement ID vs entry ID; historical vs current labels; per-set targets; rest precedence; program versions vs server revisions; incomplete vs full exports; local recovery vs cloud reversal; timeouts vs rejected writes; large-file validation vs transport limits. No further product decision blocks implementation. Credentials, email sender setup, and a reachable test database are operational prerequisites, not reasons to stop independent code/test work.

Definition of done: safe sign-in and two-device saved-data convergence, exact preservation of the existing backup, useful private program editing that drives real workouts, intact v1 behavior, real authorization/concurrency tests, complete setup documentation, and honest reporting of any external setup or verification still pending.
