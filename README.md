# FORM — Personal Fitness & Training Tracker

A mobile-first personal training website built with Next.js, React, TypeScript, Tailwind CSS, and browser-local IndexedDB. The implementation follows [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), which remains the product specification.

## Run locally

Use Node.js 24.15 or later in the 24.x LTS line and npm (verified with Node 24.15). Node 22.22.2+ in the 22.x line is also supported. The package engines reflect the minimum versions required by the test tooling.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Keep the same origin to retain access to the same local records. `localhost`, `127.0.0.1`, different ports, production domains, and deployment preview URLs each have separate storage.

For a production build:

```sh
npm run build
npm run start
```

No environment variables, API keys, accounts, hosted database, or paid services are needed. The scripts bind to the loopback interface by default. For an intentional LAN preview use `npx next dev --hostname 0.0.0.0`; permit access only on a trusted network. Optional audio/browser features may require a secure browser context; a LAN HTTP preview is not a substitute for HTTPS mobile testing.

### Windows and WSL development

Install dependencies in the environment that will run Next.js. Do not share an installed `node_modules` or `.next` cache between Windows Node and Linux Node in WSL: Next.js SWC, Tailwind, and other tools include native platform-specific binaries. The lockfile includes the required Windows and Linux optional packages; keep it.

After switching the same working folder to WSL, stop development servers and run these commands **inside WSL**:

```sh
node -p "process.platform"  # should print linux
npm ci --include=optional
npm run dev
```

`npm ci` replaces the installed dependencies using the existing lockfile. If switching back to Windows in the same folder, reinstall there as well. Separate working copies are preferable when regularly using both environments. For WSL performance, a working copy in the Linux filesystem is recommended; moving the project is not required to fix a missing SWC binary.

If a VPN/proxy causes npm registry timeouts, verify connectivity from WSL itself. Windows browser connectivity does not establish that Linux Node can reach the registry. Use the VPN's actual HTTP proxy address, and enable Node's environment-proxy support when needed. For example, with mirrored WSL networking and an HTTP proxy listening on Windows localhost port 17891:

```sh
HTTP_PROXY=http://127.0.0.1:17891 \
HTTPS_PROXY=http://127.0.0.1:17891 \
NODE_USE_ENV_PROXY=1 \
NO_PROXY=localhost,127.0.0.1 \
npm ci --include=optional
```

That proxy/port is an example verified on the development machine, not an application requirement. These variables apply only to this command and its children. Use your actual reachable proxy; localhost access differs under WSL NAT networking. Do not disable TLS certificate validation or delete the lockfile to work around a connection timeout. A telemetry notice is informational and is unrelated to compiler-binary installation failures.

References: [Next.js SWC troubleshooting](https://nextjs.org/docs/messages/failed-loading-swc), [WSL networking](https://learn.microsoft.com/en-us/windows/wsl/networking), [Node environment proxy support](https://nodejs.org/api/cli.html#node_use_env_proxy1).

## Included functionality

- Home with one active program and two clearly labeled Coming Soon programs.
- Exact Beginner Running Conditioning prescription: Pogo Jumps, Calf Raises, Bodyweight Squats, Sit-Ups, Push-Ups, and Tibialis Anterior Raises, in that order, three sets each. Sliding hamstring curls are excluded.
- Blank manual actual-repetition entry for every set. Numeric and qualitative prescribed targets remain distinct from actual performance.
- Timestamp-based rest, skip, extension, exact duration, rest-only pause, whole-workout pause, early ending, and interruption recovery.
- Review with set-status/repetition corrections and optional duration correction.
- Completed/partial history, local activity calendar, individual session details, corrections, and confirmed deletion.
- Program-specific statistics, weekly/monthly consistency, capped fixed-target attainment, exercise charts, personal records, and accessible chart data tables.
- Versioned JSON backup, whole-file validation, merge conflicts, replacement, imported-draft pausing, and one atomic pre-import recovery snapshot.
- Dark responsive UI, keyboard-accessible controls, modal focus management, reduced-motion support, and local-storage/error messages.

The initial routine has 18 sets and 240 numerically prescribed repetitions. Push-ups are submaximal; tibialis raises stop at muscular burning without pain or complete failure. Rest is **90 seconds as an app default**, adjustable from 0 to 900 seconds, and is not attributed to the mentor.

The mentor's recovery guidance remains approximately three sessions weekly, never on consecutive days, with at least one recovery day. Recent positive-repetition activity triggers guidance before starting again. An explicit acknowledgment permits recording what the user actually chooses to do.

## Commands

| Command              | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Local development server                                         |
| `npm run build`      | Optimized production build                                       |
| `npm run start`      | Serve the existing production build                              |
| `npm run typecheck`  | Strict TypeScript check                                          |
| `npm run lint`       | Explicit ESLint check                                            |
| `npm test`           | Domain, statistics, controller, screen, and storage/backup tests |
| `npm run test:watch` | Watch unit/integration tests                                     |
| `npm run test:e2e`   | Playwright against the production build                          |

Run `npm run build` before E2E. Playwright starts/stops the production server if one is not already running. It uses installed Google Chrome by default, avoiding a separate browser download. For managed Chromium, install it with `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`; other Playwright-supported installed channels may be selected similarly. On PowerShell, set a test-specific environment variable before the command, for example `$env:PLAYWRIGHT_CHANNEL = 'chrome'`.

## Data and recovery

Records live in IndexedDB database `fitness-tracker`, schema version 1. Stores are `sessions`, `drafts`, `preferences`, `metadata`, and `recovery`. Every user-data mutation checks a dataset revision in the same transaction. A stale tab loads the latest saved state and asks the user to review it; it does not automatically replay old commands.

Confirmed actions are saved before the UI advances. Unconfirmed input autosaves after about 300 ms and flushes on blur or controlled departure. The newest unconfirmed keystrokes can be lost in abrupt termination. Autosaves join the same serialized queue as confirmed actions without disabling the submit button during blur.

At most one unfinished workout exists. It survives reloads when browser storage is intact. Local interruption does not automatically pause a running workout, so unpaused time away counts in elapsed duration. An imported draft is different: it is paused at the backup's export timestamp, with remaining rest captured at that time. Time spent between export and restoration is excluded after resume.

An all-sets-recorded session is completed in a logging sense, regardless of whether targets were reached. A zero is an explicit result; a skip is missing performance and stores null. Partial sessions contribute actual recorded repetitions but do not increase completed-workout counts. Fixed-target attainment caps each set separately and excludes qualitative targets.

### Backup workflow

1. Open Settings and Export backup.
2. Save the downloaded JSON somewhere recoverable, preferably away from the same device.
3. On another browser/origin, select the file under Import a backup.
4. Review mode, counts, preferences, conflicting records, and unfinished-session choice.
5. Confirm merge or replacement.

Validation occurs before import mutations. Preparing a valid import preview pauses a running local draft; canceling leaves it safely paused. Merge adds new IDs, leaves equivalent sessions unchanged, and defaults conflicting IDs to the local result. Conflicts can explicitly use the imported result. Preferences stay local unless selected. Replacement adopts the imported records/preferences and selected imported draft.

Imports save one pre-import recovery copy and apply data in one transaction. Any failure, including quota exhaustion while saving that copy, aborts the transaction. Settings can restore the latest pre-import copy; restoration replaces later changes and consumes the copy after success. This is not an unlimited undo history.

Malformed, incompatible, and semantically inconsistent backups are refused without partial imports. Newer unsupported formats require an app update. There are no invented older-version migrations in version 1. A file over 25 MiB requires confirmation before processing; that is a caution threshold, not a hard rejection limit.

When damaged or unsupported local records prevent normal loading, the app offers a raw recovery export without automatically deleting data. Raw exports are diagnostic rescue files, not ordinary validated backups; repairing them requires inspecting the underlying issue.

### Local-storage limitations

Clearing site data, private browsing, browser eviction, profile removal, device loss, or disk/OS failure can remove records. Different browser profiles and devices do not synchronize. Download initiation does not prove a file was saved. Local recovery snapshots share the same device risks. There is no authentication or automatic cloud upload, and sharing the website URL does not share workout history.

## Timing and browser limits

Rest uses a persisted deadline and recalculates from the current timestamp; intervals only redraw the display. Whole-workout pauses are subtracted from elapsed duration. Rest-only pause does not pause overall duration, and review time is excluded.

Background tabs and locked screens may suspend JavaScript, sound, and vibration. On return, the timer reconciles and waits for the user before starting the next set. No background alarms, operating-system notifications, or offline reloading are promised. Sound/vibration are optional and off by default; support and device settings vary.

Wall-clock changes can affect timing. Impossible negative durations are not silently saved; correct the device clock and retry. Review/history support explicit duration correction while preserving the original calculated value. The app does not estimate active exercise time.

## Architecture

- `src/programs`: immutable catalog and exact mentor prescription.
- `src/domain`: Zod schemas, inferred types, and semantic invariants.
- `src/features/workout/machine.ts`: pure transitions and corrections, driven by explicit time values.
- `src/features/workout/provider.tsx`: durable command queue, tagged/debounced input, lifecycle refresh, errors, and optimistic-concurrency handling.
- `src/features/workout/timer.ts`: countdown/elapsed calculations; `alerts.ts`: optional feature-detected alerts.
- `src/lib/storage`: IndexedDB connection and transactional application repository.
- `src/lib/backup`: envelope validation, equivalent-record comparison, previews, atomic imports, downloads.
- `src/features/statistics`: pure metric selectors and calendar-date arithmetic.
- `src/components`: accessible shared controls, charts, calendar, and session review/detail.
- `src/app`: App Router routes with browser data loaded after hydration.
- `tests`: meaningful domain, integration, and browser workflows.

Runtime dependencies beyond Next/React are only idb and Zod. Charts are small SVG components with data tables. No ORM, state framework, date library, chart library, external font, or icon package is needed. Test packages are development-only. Versions are pinned and the npm lockfile is retained.

Snapshot-based sessions preserve exercise names, instructions, order, targets, and program/template versions. Adding another repetition-based program primarily requires a validated definition and catalog availability change. Unknown historical programs can be displayed from imported snapshots without becoming executable catalog programs. New recording kinds require explicit schemas, inputs, analytics, and backup compatibility.

The repository boundary prepares for future cloud persistence without pretending to implement synchronization now. Future sync still needs identity, authorization, ownership, conflict policy, and deletion handling; local revision counters are not a distributed protocol.

## Verification and limits

Verified on 2026-10-29 with Node 24.15 and production Next.js:

| Check | Result |
|---|---|
| Strict TypeScript | Passed |
| ESLint | Passed |
| Unit/integration/component tests | 80 passed across 7 files |
| Production build | Passed |
| Chrome production E2E | 13 passed |
| Responsive overflow checks | Passed at 320, 390, 768, and 1,440 CSS pixels |
| Large browser dataset | Imported 5,000 sessions / 90,000 sets; history and all-time chart verified |
| Browser runtime/hydration monitoring | No errors in the tested primary workflows |

The E2E suite covers the full 18-set prescription, interrupted sessions, corrections, backup downloads into a fresh browser context, duplicate merges, invalid files, conflict resolution, replacement/recovery, paused draft restoration, and a stale action from a second tab. Desktop Home and mobile workout screenshots were visually reviewed; test screenshots are generated under the ignored `test-results/` directory.

The release checks cover exact mentor order/targets, zero versus missing results, full/partial workflows, timer pauses and interruption, input-save races/retries, stale writes, corruption, quota rollback, import conflicts, paused restoration, and statistics date boundaries. A 5,000-session/90,000-set fixture exercises statistics performance.

Browser tests use production Next.js and Chrome, including mobile-sized viewports. Real iOS/Android hardware, screen locking, physical vibration/audio behavior, and assistive-technology interaction cannot be fully validated by desktop automation. These require device testing before relying on alerts in practice. Browser viewport tests are not represented as physical-device verification.

No product-scope deviations are intended. Related UI helpers are combined where that keeps the small application clear rather than creating every suggested folder. A normal Next.js deployment is used rather than static export. Advanced charts, automated backup reminders, storage-permission prompts, accounts, cloud sync, custom programs, and additional exercise types remain deferred as specified.

## Deployment and maintenance

No deployment, Git commit, or push is performed by implementation alone. When authorized, connect the repository to Vercel, choose its Next.js preset and a supported Node LTS, and run the complete release gate. No application secrets are required. The personal/noncommercial use case fits the intended Vercel Hobby scope; verify its current terms and quotas before publishing.

Use a stable production hostname. A domain change requires export from the old origin and import on the new one. Preview deployments have separate data. Verify direct routes, a workout, persistence, and backup restoration on production after deployment.

Keep stable dependencies patched. Database schema, backup format, and prescription versions are independent. Test real migrations with old backup fixtures before shipping them. A code rollback does not undo a data migration, so do not assume an older release can read newer records.
