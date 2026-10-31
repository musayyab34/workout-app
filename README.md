# FORM — Personal training, across your devices

FORM is a mobile-first Next.js, TypeScript and Tailwind workout tracker. Version 2 adds private Supabase accounts, synchronization of saved sessions/programs/preferences, and an editable program library. IndexedDB remains the durable recording layer. Unfinished workouts stay on their starting device.

## Run locally

Use Node 24.x LTS (24.15 or newer), or supported Node 22.22.2+. Install and run in the same operating system:

```sh
npm ci --include=optional
npm run dev
```

Open http://127.0.0.1:3000. With no Supabase environment configuration, local recording, programs, history, and backups remain usable. To connect cloud services, copy `.env.example` to `.env.local` and follow [the complete Supabase setup guide](implementation-plans/SUPABASE_SETUP.md).

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

Use your HTTPS production origin for the last value on Vercel. Never put a database password, secret/service-role API key, SMTP password, or personal access token in these variables. No privileged runtime key is required.

For production locally:

```sh
npm run build
npm run start
```

### Windows, WSL, and VPNs

Next/SWC and Tailwind include native binaries. Do not share an installed `node_modules` or `.next` between Windows Node and Linux Node in WSL. After switching environments, stop servers and run `npm ci --include=optional` in the new environment. Keep the cross-platform lockfile. Separate working copies are preferable. This implementation was checked with Windows Node; reinstall inside WSL before running it there.

If npm times out behind a VPN, check connectivity from the actual shell. A Windows browser working does not prove Linux Node connectivity. Use your VPN's reachable HTTP proxy. An example previously verified with mirrored WSL networking was:

```sh
HTTP_PROXY=http://127.0.0.1:17891 \
HTTPS_PROXY=http://127.0.0.1:17891 \
NODE_USE_ENV_PROXY=1 \
NO_PROXY=localhost,127.0.0.1 \
npm ci --include=optional
```

Use your actual proxy/port. These settings are local development concerns, not Vercel configuration. Do not disable TLS validation or delete the lockfile to fix a network timeout.

## What works

- Exact bundled mentor program: Pogo Jumps, Calf Raises, Bodyweight Squats, Sit-Ups, Push-Ups, Tibialis Anterior Raises; three sets each. Sliding hamstring curls remain excluded. Fixed targets total 240; the last two movements use qualitative targets.
- Blank actual-repetition entry, explicit zero vs skipped/missing, guided variable-length workouts, timestamp-based rest, pause, skip, end/review, corrections, and interruption recovery.
- Saved completed/partial history, calendars, program filters, capped fixed-target attainment, best sets, and comparable entry/set-count chart filtering.
- Personal program creation/editing, ordered exercises/sets, mixed fixed/qualitative targets, instructions/notes, guidance, references, rest defaults, known/new movement identities, duplicate, archive/unarchive, and restore/view original mentor prescription.
- Email/password signup/login, confirmation, resend, password recovery/reset, and cookie session refresh through Next.js Proxy.
- Supabase's default email links work through code exchange; open them in the browser where you requested signup/reset. Customized token-hash links remain supported. Personal testing can use the built-in sender with your project-team email; custom SMTP is needed for normal delivery to friends.
- Durable local upload queue, per-account isolated caches, server CAS, idempotent retries, deletion tombstones, paged pulls, explicit local/cloud conflicts, and account-safe asynchronous work.
- Strict v1 reading and v2 export/import, local merge/replace with recovery, and reviewed atomic account merges using immutable staged chunks.

The initial rest default is 90 seconds as an app setting. Start-screen choice overrides routine override, which overrides account preference. Custom programs do not inherit a made-up mentor schedule. Historical snapshots and active workouts retain their original exercise names, targets, instructions, order and timing when you edit a program.

## Data protection and synchronization

Guest data is in `fitness-tracker-v2:local`. Account caches include both project hostname and user UUID. The original `fitness-tracker` v1 database is upgraded to version 2 to block old clients, then copied non-destructively into the guest workspace, including pre-import recovery. Its original record values remain intact. A migration marker prevents re-copying over newer guest data. A v1 code rollback cannot open that upgraded database; use the current app and exports instead of forcing a downgrade.

Signing in does not upload guest records automatically. Export your existing log first, then select the file in Settings while signed into the intended account, review Merge, and confirm. Each friend has a separate account. Use the same account on your other devices. Migration verification requires checking cloud read-back and a second device, not only seeing an upload finish.

Saved sessions, personal definitions, and preferences synchronize while the app is open. Unfinished workouts, editor scratch forms, and local recovery copies do not move between devices. Recording continues locally during an outage on an already loaded page. Offline reloading and background uploads while the app is closed are not promised.

Settings shows pending uploads, last successful sync, failures, and conflicts. A write is Synced only after acknowledgement and a completed pull. Both sides of conflicts remain preserved. Use cloud records a local recovery alternative before discarding your pending version. Keep my version sends a new revision-checked mutation. Conflicts never create a duplicate workout automatically. A pending deletion is hidden from normal totals but preserved for recovery/export.

Signed-out account data stays recoverable in its local namespace; the app hides it until that account is selected again. Browser storage is not encrypted. Someone with access to the browser profile/developer tools may inspect it. Browser eviction, disk failure, private browsing, or clearing site data can remove drafts and unsynced records. A different origin/browser profile has separate local storage. Keep independent downloaded backups.

## Backups and account imports

Export includes this device's visible history, programs, preferences, optional draft, unresolved conflict alternatives, and pending-delete recovery payloads. It excludes credentials, trusted owner IDs, server coordination state, and old upload commands. It cannot include another device's unsynced workout or draft. Complete a successful pull before treating an export as a full account snapshot.

Version 1 files remain supported. Version 2 contains programs and typed recovery alternatives with counts. Invalid/newer/inconsistent files are refused. Files above 25 MiB receive a processing caution rather than automatic rejection.

Guest mode supports merge and replacement, with one atomic pre-import recovery copy. Account mode supports reviewed merge; absent records do not imply deletion. Restoring deleted account sessions from an old backup requires explicit opt-in. Different imported program definitions default to the existing program and preserve the incoming definition as a quarantined recovery alternative in Account & synchronization, where it can be inspected/exported/adopted explicitly. This is the implementation's alternative to a second inline program-conflict selector.

Account merges write a durable local journal/recovery copy before staging. Each chunk is immutable, owner-scoped, checksummed and idempotent. Fully assembled documents are validated into private staging; the final transaction rechecks ownership, completeness, account/entity revisions and identity constraints, then applies all changes or none. A lost response resumes the same batch. Settings provides Resume interrupted account import and Cancel uncommitted import; cancellation checks the server outcome first. A committed account import cannot be reversed with a local-only undo.

The private real backup under `.private/backups/` passed existing schema/semantic validation and a local v2 round-trip field comparison. Its contents are excluded from Git and the bundle. It has not been uploaded, and actual account/second-device verification remains for the owner after setup.

## Database architecture

Migrations are under `supabase/migrations/`. Owner-scoped public tables have RLS and authenticated read-only grants. Writes use restricted RPCs. Definer helpers need elevated table access because direct browser writes are revoked; they fix `search_path`, qualify objects and derive/check ownership from `auth.uid()`. Anonymous access and cross-account access are denied. No client owner field can grant permission to another account.

Account change versions are allocated under a per-owner row lock. Stable paged reads validate a fixed high-water version before advancing the local cursor. Server versions travel as decimal strings. Mutation receipts and tombstones are retained so old offline clients cannot silently resurrect deleted data. Normal recordings save domain data plus outbox entries atomically; draft/timer writes stay local.

SQL JSON schema documents are generated from the shared Zod models, supplemented by PostgreSQL semantic checks. The embedded SQL test runner executes actual PostgreSQL permissions, constraints, functions and transactions. Its auth identity function substitutes for Supabase's JWT-to-database integration; it does not test Supabase's hosted Auth or PostgREST services.

Main code boundaries:

- `src/domain`: schemas, invariants, personal definitions.
- `src/features/workout`: pure engine and durable command provider.
- `src/lib/storage`: IndexedDB, workspace selection, migration, transaction/outbox operations.
- `src/features/sync`: remote protocol, conflicts, staged merge journal.
- `src/lib/supabase`, `src/proxy.ts`, `src/features/auth`: clients, token refresh, account lifecycle.
- `src/lib/backup`: versioned validation, previews, exports, recovery.
- `src/features/statistics`: derived metrics and calendar arithmetic.

## Verification commands

```sh
npm run typecheck
npm run lint
npm test
npm run test:db
npm run test:db:large
npm run build
npm run test:e2e
```

Run browser suites sequentially because they share the output directory. Playwright uses installed Google Chrome by default. Alternatively install managed Chromium (`npx playwright install chromium`) and set `PLAYWRIGHT_CHANNEL=chromium`. The E2E server uses the production build and starts automatically when port 3000 is free. Avoid rebuilding underneath a running production test server.

Verified during implementation on 31 October 2026: typecheck, lint, 85 unit/integration/component tests across nine files, production build, and 15 Chrome production-browser workflows. The workflows cover exact full/partial workouts, interruption, correction, backup/conflicts/recovery, two-tab stale writes, the custom editor driving a real workout while preserving prior history, local auth fallback, and 320/390/768/1440 px layouts. The browser suite imported and displayed 5,000 sessions/90,000 sets. Embedded PostgreSQL tests cover RLS, anonymous denial, owner spoofing, CAS, retry receipts, tombstones, staged import and immutable snapshot enforcement. Sync integration tests exercise offline/lost-response recovery, competing corrections, in-flight successors and workspace switches using the actual SQL functions through a simulated SDK transport.

### Remaining verification and limits

The local Supabase CLI was initialized, but Docker and Podman are unavailable on this machine. No hosted project or credentials were supplied/changed. Consequently live Supabase Auth, SMTP delivery, JWT/PostgREST integration, real HTTP request limits/timeouts, two real signed-in devices and the private owner's cloud migration have **not** been verified. Do not describe this as a completed cloud rollout. Run those checks against a disposable local/development Supabase stack before enabling production sync. Real iOS/Android hardware, physical alerts and assistive-technology testing also remain manual checks.

Large SQL tests use a slower embedded PostgreSQL engine. Staging validates each document independently; final commit uses immutable privately validated items. Actual Supabase HTTP timing and provider quotas still require testing. Resource/timeouts must preserve the source and atomic outcome; do not disable global timeouts. The batch advances the account counter once per changed entity within one locked transaction rather than assigning a single version to all entities; fixed-head pagination remains consistent because the whole transaction commits together.

Ordinary browser timer limits still apply: rest deadlines reconcile when returning from background, but OS-level alarms/sound/vibration are not guaranteed. Explicit whole-workout pauses exclude time; other unpaused away time counts and can be corrected in Review. Charts count saved sessions, never drafts; zero differs from missing. No consecutive-day streak incentives, automatic progression, PWA, social features, paid APIs or deployment are added.

## Supabase and Vercel activation

Follow [SUPABASE_SETUP.md](implementation-plans/SUPABASE_SETUP.md): create a separate development environment, enable email confirmation/custom SMTP, configure callback URLs/templates, apply the reviewed migrations, set the three environment variables, and test. Deploy only when you choose, then perform the reviewed import and second-device verification. Vercel does not apply migrations automatically. Never disable RLS to fix setup errors.

The original [v1 plan](implementation-plans/IMPLEMENTATION_PLAN.md) and reviewed [v2 plan](implementation-plans/VERSION_2_IMPLEMENTATION_PLAN.md) remain the product specifications. No commit, push, deployment, hosted migration or personal-data upload is performed by this implementation task.
