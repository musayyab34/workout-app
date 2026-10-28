# Personal Fitness & Training Tracker

**Status:** Reviewed and approved as an implementation blueprint. Application implementation has not started.

**Revision:** 1.1 — complexity, edge-case, and ambiguity review, 2026-10-29.

**Purpose:** Give an AI coding agent a complete specification for a maintainable, mobile-first personal training website. Implement this plan when the user authorizes execution. Creating this document alone does not authorize deployment, commits, or application development.

## 0. Review decisions and implementation authority

This document supersedes the earlier conversational blueprint. Preserve the user's workout prescription exactly. The user's later explicit directions take precedence over this document.

The review made these decisions:

- Keep IndexedDB: transactional session saves and imports justify it. Use one small repository, not a general data-access framework.
- Use one React workout controller with pure transitions. Do not add a state-machine library, global state library, service container, or event log.
- Keep one unfinished workout across all programs. Use revision-checked writes for multiple tabs; do not build tab ownership, leases, or heartbeats.
- Use one user rest default and one session rest setting in version 1. Do not implement unused exercise/set override controls.
- Use timestamp-based timers. Remove automatic clock-jump detection and its additional state; explain the wall-clock limitation and allow duration correction.
- Freeze imported drafts at the backup timestamp. A countdown must not run for days merely because a backup was restored later.
- Serialize persistence commands and cancel obsolete input saves so delayed typing cannot overwrite a confirmed set.
- Allow correction of mistakenly skipped or unattempted sets, with no replay of timers or fabricated exercise timestamps.
- Define completion as recording every prescribed set, separate from target attainment. Use explanatory copy to avoid treating low repetitions or zero as reaching a training target.
- Make backup file size a processing caution, not an arbitrary limit that makes the application's own exports unrestorable.
- Keep one pre-import recovery copy. It is a justified data-protection feature, not a substitute for downloaded backups.
- Defer automated backup reminders, persistent-storage permission prompts, elaborate analytics, and additional recording types.

There are no unresolved product decisions blocking implementation. Choose routine details consistently with this document and record material deviations in the project README. Ask only when a genuine blocker or a new authorization boundary prevents progress.

## 1. Project overview

### Goals

Create a polished personal training website supporting multiple independent programs. The initial program conditions a beginner preparing for a 7 km running competition in 2027. The application is not exclusively a running tracker.

Priorities, in order:

1. Convenient mobile workout recording.
2. Accurate actual repetitions and recoverable progress.
3. Clear rest timing and exercise guidance.
4. Reliable local persistence and JSON backup/restoration.
5. Useful history and progress statistics.
6. Extensibility without unnecessary abstractions.

### Essential version 1

- Next.js, TypeScript, Tailwind CSS, Vercel-compatible deployment.
- Three program cards, one executable program.
- Guided workouts, actual repetitions, rest controls, pause, skip, early ending, and recovery.
- Review, history, corrections, and focused statistics.
- Browser-local persistence, export, validated merge/replace import, and pre-import recovery.
- Responsive dark design and accessible controls.

### Explicit exclusions

No server/cloud database, accounts, synchronization, PWA, service worker, push notifications, native-app functionality, GPS, wearables, social features, subscriptions, AI coaching, custom-program editor, or invented pull-up workouts. No paid dependencies or infrastructure. No automatic target progression.

### Assumptions

| Topic | Decision |
|---|---|
| User model | One person using a browser profile; no authentication |
| Language | English initially |
| Persistence | IndexedDB inside the browser; no hosted database |
| Concurrent sessions | One unfinished session across all programs |
| Program authoring | Structured definitions in source code |
| Week | Monday through Sunday |
| Historical dates | Preserve captured local dates; do not regroup old records when traveling |
| Initial rest | 90 seconds as an application default, not a mentor prescription |
| Hosting | Standard online Next.js website on Vercel Hobby |
| Internet | Needed to load the website; no offline-loading guarantee |

An already loaded page can continue local recording during a network interruption, but reloading without connectivity is not guaranteed to work. This does not introduce an offline/PWA promise.

## 2. Requirements specification

### Exact initial program

Program cards:

1. **Beginner Running Conditioning** — Active.
2. **Pull-Up Progression** — Coming Soon.
3. **Future Training Program** — Coming Soon.

Coming Soon programs have no executable workouts and no Start button.

| Order | Exercise | Sets | Target per set | Mentor instruction |
|---|---|---:|---|---|
| 1 | Pogo Jumps | 3 | 20 repetitions | Keep jumps low and light. Focus on using the ankles rather than excessive knee bending. |
| 2 | Calf Raises | 3 | 20 repetitions | Begin with both feet on flat ground. When these become easy, discuss progression with the mentor. |
| 3 | Bodyweight Squats | 3 | 20 repetitions | Start with bodyweight repetitions. Progress gradually. |
| 4 | Sit-Ups | 3 | 20 repetitions | Perform controlled repetitions and gradually build capacity. |
| 5 | Push-Ups | 3 | Submaximal | Perform three submaximal sets, stopping before muscular failure. |
| 6 | Tibialis Anterior Raises | 3 | Until muscular burning | Perform three sets until muscular burning, without pushing into pain or complete failure. These are intended to help condition the lower legs for running. |

There are exactly 18 prescribed sets. The first four exercises contain 240 prescribed repetitions. The last two have no numeric repetition target. **Sliding hamstring curls are deliberately excluded.**

Reference demonstration: https://youtube.com/shorts/pQcvW08rnAk

Preserve the reference as a program-level external link, opening in a new tab with appropriate link security attributes. Its contents were not verified during planning. Do not invent instructions from it, embed it, or assign it to a particular exercise without evidence.

### Mentor rules

- Perform the routine approximately three times per week.
- Never train on two consecutive days.
- Leave at least one recovery day between sessions.
- Avoid muscular failure on every exercise.
- Do fewer repetitions when the prescribed count is too difficult.
- Gradually increase performance over time.
- Prioritize good technique and consistency.

Do not silently rewrite these rules, increase targets, recommend catch-up workouts, or present the app as assessing physical readiness.

### Recovery guidance

Before starting this program, check recent positive-repetition activity, including partial sessions. Show a prominent warning when activity occurred today or yesterday. Emphasize resting, but allow an explicit **Continue to record a workout** action so the tracker can record what actually happened. This is an acknowledgment, not a recommendation to train.

Use calendar-day comparison, not a mandatory 48-hour interval. For warning purposes, convert available recorded activity timestamps to the current device time zone; for manually corrected results without an observed timestamp, use their explicit activity date. Do not change historical display dates. A session spanning midnight can affect recovery guidance on both dates.

### Repetition entry

- Every set, including qualitative-target exercises, accepts manually entered actual repetitions.
- Initialize actual-repetition input as blank, never as the target.
- Valid input is a whole number from 0 through 10,000, inclusive. This ceiling is an input safeguard, not a training recommendation.
- Reject blanks on confirmation, negative values, decimals, exponent notation, and nonnumeric input. Trim surrounding whitespace; normalize leading zeros.
- Zero means an explicitly logged attempt with no repetitions. Skipped means no recorded attempt and stores null, not zero.
- Use a text input with a numeric input mode and explicit validation to avoid inconsistent browser number-field behavior.
- Actual and prescribed values are always separate fields.
- Allow corrections before confirming and during review/history editing.

### Non-functional requirements

- Workout data remains on the device in version 1; no analytics or error service receives it.
- App routes may be public; sharing the URL does not share local workout records.
- Strict TypeScript; no browser APIs during server rendering.
- Responsive at 320 CSS pixels and above without horizontal overflow.
- Accessible labels, keyboard operation, visible focus, reduced-motion support, and adequate contrast.
- Controls at least 44 by 44 CSS pixels; primary workout actions preferably 48–56 pixels tall.
- Display real persistence state. A write failure must not be represented as success.
- Handle a 5,000-session test dataset without freezing ordinary navigation or chart interactions; profile before adding optimization complexity.
- No destructive storage reset as an error-recovery technique.

## 3. User experience

### Navigation and routes

Use Home, History, Progress, and Settings. Mobile uses labeled bottom navigation. Desktop uses a compact top navigation. During a workout, replace general navigation with focused workout controls and an explicit pause-and-leave action.

| Route | Purpose |
|---|---|
| `/` | Home, program cards, weekly summary, draft banner |
| `/programs/[programId]` | Program overview and start/resume |
| `/workout` | Current draft, rest, pause, and recovery |
| `/workout/summary` | Ended draft awaiting save |
| `/history` | Calendar and chronological session list |
| `/history/[sessionId]` | Saved session detail and corrections |
| `/progress` | Program-scoped statistics |
| `/settings` | Preferences, storage explanation, export/import/recovery |

Unknown program: show not found. Unknown local session: show a local-data explanation and link to History. Workout without a draft: show a link to the active program. Summary with an active, unended draft: route back to the workout. Never create data merely by visiting a route.

### Home

Show an unfinished-workout banner first when present, then a compact weekly summary, the three program cards, and a recent-session preview. Coming Soon cards clearly communicate that no workout exists yet.

### Program overview

Show purpose, ordered exercises, set targets, mentor instructions and frequency rules, reference link, recent program activity, and rest setting. Label 90 seconds as the app default. The primary action is Start Workout or Resume Workout.

An existing draft blocks creation of another. Offer resume, end and review, or confirmed discard. Do not silently replace it.

### Active workout

Prioritize the exercise name, exercise/set position, target, technique cue, large repetition input, and Complete set action. Show prior set results, elapsed duration, and two progress counts: recorded sets and resolved sets. Resolved includes skipped sets; never visually imply skipped sets were completed.

Example: target 20, actual 13 saves both values unchanged. Push-ups display the submaximal instruction while accepting a numeric actual value.

Put Skip set, Skip remaining exercise, and End workout in a More menu. Skip exercise and End workout require confirmation. Skip set may be immediate, with correction available in review. Keep a clear Pause workout action.

### Rest

After confirming a set, begin one rest if another pending set remains. Show countdown, next exercise/set, Pause rest, Resume rest when paused, +30 seconds, Skip rest, and a secondary exact-duration control.

On expiry or skipping, show **Rest complete — start next set**. Wait for a tap; never advance through unattended exercises. No rest follows the final pending set. Crossing an exercise boundary does not add a second rest.

### Pause and leaving

Pause workout freezes elapsed workout time and any running rest. Pausing rest alone does not freeze overall elapsed time.

App-owned navigation out of an active workout offers Stay or Pause and leave, persisting the pause first. Browser Back, tab closure, OS termination, and external navigation are not reliably preventable; durable draft saves are the safeguard. Returning always shows the current recoverable draft. Do not depend on unload handlers or build a complex browser-history trap.

### Skipping and early ending

- Skip set marks the current set skipped with null repetitions and advances without automatic rest.
- Skip remaining exercise preserves recorded results and skips only its pending sets.
- End workout confirms the choice, marks remaining pending sets not attempted, freezes end time, and opens Review.
- Review does not resume the timed workout. The user can correct records or save/discard it.

### Review and save

Show outcome, recorded/skipped/not-attempted counts, per-exercise actual results, fixed-target attainment, elapsed duration, corrections, and records where applicable.

Use **All sets recorded** for a completed outcome, with supporting copy that targets may still be below prescription. Use **Partial workout** when any set is skipped or not attempted. A recorded zero contributes no repetitions or target credit even though the set has a result.

Keep Review as a saved draft until Save to History succeeds. Save writes history and removes the draft atomically. Then show **Saved on this device**. Double saving must not create duplicate entries.

### Corrections

Review and saved history allow an explicit edit form for set disposition and actual repetitions. A result can be corrected between recorded, skipped, and not attempted; recorded requires valid repetitions, other statuses require null. Recompute outcome and statistics after saving.

Preserve an observed recording timestamp when correcting its count. A previously unrecorded set corrected to recorded has no fabricated original recording timestamp; retain a correction timestamp, an origin marker of manual correction, and an activity date defaulting to the session start date. Let the user choose an activity date within the session's captured start/end local dates when needed. Do not replay timers or alter the prescription.

Duration can be corrected in Review or history as an explicit positive/nonnegative elapsed duration value, with the original calculation preserved. Show corrected duration as such. Do not require a note, but allow one.

Session deletion requires confirmation, shows the session identity, and offers export first. Do not add a bulk-delete feature to version 1.

## 4. Visual design system

Use dark, restrained, athletic styling with generous spacing and one primary accent. Avoid excessive neon, gradients, decorative animation, or dashboard clutter.

| Token | Value |
|---|---|
| Background | `#0B0F14` |
| Surface | `#141B23` |
| Elevated surface | `#1B2530` |
| Decorative border | `#2B3948` |
| Main text | `#F3F6FA` |
| Secondary text | `#A8B5C5` |
| Accent | `#72E0C3` |
| Text on accent | `#08110E` |
| Warning | `#F0C36A` |
| Error/destructive | `#FF8A91` |
| Focus | `#91BCFF` |

Verify actual contrast pairs. Decorative borders are not sufficient as the only boundary for an interactive control. Communicate status with text/icons as well as color.

Use a system sans-serif stack; no external font dependency is needed. Page titles 28–32 px, exercise titles 24–28 px, body/input text 16–18 px, secondary labels 13–14 px, countdown 56–72 px with tabular numerals.

Spacing scale: 4, 8, 12, 16, 24, 32, 48 px. Mobile gutters 16 px. Main desktop width about 1,120 px; workout width about 560 px. Card radius 16 px; control radius 10–12 px. Prefer subtle borders over heavy shadows.

Reusable components: button, icon button, card, badge, input, set indicator, progress bar, timer, confirmation dialog, empty state, persistence status, inline error, calendar day, chart frame, and equivalent chart data table.

Account for safe areas and the virtual keyboard. Do not obscure the main action or disable pinch zoom. No hover-only functionality. Use 120–200 ms purposeful transitions and reduced-motion alternatives. Manage dialog focus and restoration. Announce timer completion, not every second.

## 5. Technical architecture

### Stack and dependencies

Use current stable, mutually compatible Next.js App Router, React, TypeScript, and Tailwind releases at implementation start. Pin resolved versions in a committed lockfile; do not use canaries. Use npm and a Node.js LTS version supported by the chosen Next.js release and Vercel.

| Additional dependency | Why it exists |
|---|---|
| `idb` | Small promise wrapper for transactional IndexedDB access |
| `zod` | Runtime import/storage validation with inferred domain types |
| Vitest | Deterministic domain, calculation, and validation tests |
| React Testing Library and test DOM environment | Meaningful input and interaction tests |
| `fake-indexeddb` | Repository transaction tests outside a browser |
| Playwright | Real-browser workflow, reload, import, and multi-tab tests |

Only idb and Zod are additional runtime dependencies initially. Use React context/controller state instead of Redux, Zustand, or XState. Use native date/Intl APIs instead of a date library. Implement a small SVG line chart and bar chart with tables; no chart framework for version 1. No ORM, backend API, or authentication library.

Native dialog with a small accessible wrapper is sufficient for dialogs. Use simple local SVG icons rather than an icon dependency unless an established project setup already supplies one.

### Layers

1. Program catalog: immutable program descriptors and versioned templates.
2. Domain: schemas, targets, snapshots, and invariants.
3. Workout engine: pure transitions accepting explicit time values.
4. Controller: serialized commands, persistence, lifecycle reconciliation, and effects.
5. Repository: small application-specific transactional operations.
6. Backup service: validation, migrations, preview, merge, replacement, recovery.
7. Statistics: pure selectors over saved sessions.
8. UI: display state and dispatch commands.

Do not invent a generic plugin system. A pure transition function plus a small controller is sufficient; persistence is asynchronous, so avoid dispatching an optimistic reducer state and later rolling it back.

### Client boundary and state

Use server-renderable route shells and static program information. Browser storage, timers, workout state, and local history live in client components. During initialization show a loading state, not a false empty history.

Separate persisted records from temporary UI state and derived values. Do not persist charts, totals, or countdown ticks.

### Write flow and races

For a command: validate against the current state and expected set ID; produce candidate state; commit with a revision check; publish committed state; run effects. Disable the corresponding action during persistence.

Serialize commands through one controller queue. Debounced typing saves are replaceable, tagged with session ID, set ID, and an input generation. Confirmation flushes/captures the latest input and invalidates older queued input writes. Navigation, export, and import preparation also flush relevant input. Obsolete writes are discarded, never applied to a new set or session.

Use a stable session ID and instance set IDs. Reject commands for an outdated phase/set/revision. Saving an already-saved session ID returns the existing saved result when appropriate, rather than inserting a duplicate.

## 6. Data models

### Conventions

UUID identifiers; UTC ISO timestamps in JSON; integer milliseconds for durations; whole-number repetitions; explicit `YYYY-MM-DD` calendar dates; captured IANA time zone; increasing local revisions. Infer TypeScript types from validation schemas where practical instead of maintaining duplicate definitions.

### Program and template

Program: stable ID, slug, name, description, availability, version, workout templates, guidance, and a small list of supported metric identifiers. Coming Soon programs have empty template lists.

Template: stable ID/version, name, ordered exercise entries, and app rest default. Version 1 has one template in the active program. Supporting a list is enough for future programs; no template-selection interface is needed until a program has multiple templates.

Exercise: stable identity, display name, technique instructions, recording kind, optional vetted reference links. Template entry: unique entry ID, exercise ID, ordered prescribed sets. Set prescription: stable template-set ID, number, recording kind, target.

Version 1 recording kind is repetitions. Target is a discriminated variant: fixed repetitions with a number; submaximal with instruction; or muscular burning with instruction. Do not encode qualitative targets as zero or infinity.

### Session snapshot

At Start, copy program/template IDs, names and versions; ordered exercises, instructions and prescribed sets; target variants; and resolved session rest setting. Historical targets must never be re-read from a changed catalog definition. Unknown programs can still be shown from snapshots.

### Set record

Fields: instance ID, template-set ID, exercise-entry ID, set number, target snapshot, status, actual repetitions, optional observed recording timestamp, activity date for recorded sets, origin (`live` or `manual-correction`), optional correction timestamp, optional skip note.

Statuses: pending, recorded, skipped, not attempted. Recorded requires an integer actual value and activity date. All other statuses require null repetitions. Pending exists only in an unfinished active draft. Preserve the distinction between an explicit zero and missing data.

### Draft

Fields: session ID/revision; snapshot; start timestamp/local date/time zone; phase; current pending-set ID when relevant; set records; unconfirmed input; session rest duration; rest state; whole-workout pause state; accumulated paused milliseconds; last saved timestamp; end timestamp/local date once in Review.

At most one draft. A Review draft has no pending sets. A resumed snapshot remains executable without the current catalog entry as long as its recording kinds and schema are supported.

### Saved session

Fields: session ID/revision; snapshot; records; start/end timestamps and captured dates; outcome (`completed` or `partial`); end reason; calculated elapsed duration; optional corrected duration/note; created/updated timestamps.

All prescribed sets recorded means completed. Any skipped/not-attempted set means partial. No pending sets in saved history. This classification can change after explicit corrections. An all-zero but fully recorded session is completed in the logging sense, contributes zero volume, and must not be described as targets achieved. An all-skipped session is partial and contributes no volume.

### Rest and pause

Rest fields: ID, source set, next pending set, original duration, deadline when running, remaining milliseconds when paused, status, start timestamp. Use deadline or paused remaining time as appropriate, never a decrementing counter as truth.

Whole-workout pause stores previous phase, pause start, and whether rest was independently running or paused. Resuming restores that distinction. Active sessions accumulate only explicit whole-workout pause time; Review freezes elapsed time at its end timestamp.

### Preferences

Default rest 90 seconds; sound off; vibration off. Rest setting accepts whole seconds from 0 through 900. A session copies the user default at Start. A workout-level setting changes future rests in that session only. Settings changes affect new sessions. Adjusting a currently active rest is explicit and separate. The +30 control cannot exceed 900 seconds remaining.

The approximate weekly goal is three for the initial program and is informational; no goal editor is required. Monday is the fixed week start in version 1. Store last export-request information as metadata, not as workout data.

### Statistics and backup

Statistics are derived, not authoritative stored records. Backup envelope: fixed application identifier, format version, export ID/time, app version for diagnostics, preferences, saved sessions with snapshots, optional draft, expected counts. Exclude derived statistics, coordination metadata, and the recovery copy itself.

Keep IndexedDB schema version, backup format version, and prescription versions independent. Local revisions are concurrency markers, not cross-device conflict-resolution truth.

## 7. Workout state machine

Phases: no draft, performing set, resting, next set ready, workout paused, review, saved. Storage errors and startup recovery prompts are UI states over committed domain state.

| State/event | Result |
|---|---|
| No draft → Start | Validate program; create snapshot and 18 pending sets; persist; enter first set |
| Performing → Edit input | Update local text and schedule tagged, replaceable draft save |
| Performing → Confirm | Validate and record actual; clear obsolete input saves |
| Confirm with another pending set | Begin session-configured rest, or next set ready when duration is zero |
| Confirm with no pending sets | Freeze end time; enter Review |
| Performing → Skip set | Mark skipped; advance directly to next pending set, or Review if none |
| Performing → Skip remaining exercise | Skip only its pending sets; advance directly, or Review |
| Rest running → Pause rest | Store remaining time; clear deadline; remain Resting |
| Rest paused → Resume rest | Create deadline from remaining time |
| Resting → Extend/set remaining | Update deadline or paused remainder; zero resolves to next set ready |
| Resting → Expire/Skip rest | Enter next set ready |
| Next set ready → Start next set | Enter performing set |
| Active → Pause workout | Capture prior phase/rest state and freeze whole-workout timing |
| Workout paused → Resume | Restore prior phase; resume rest only if it was running before whole-workout pause |
| Active/paused → End early | Mark pending sets not attempted; freeze end time; enter Review |
| Review → Correct results | Validate edits; recalculate outcome; remain Review |
| Review → Save | Atomically save session and remove draft |
| Any draft → Confirm discard | Delete draft; return to no draft |

The current pointer always refers to the next pending set when one exists. Skip does not fabricate effort or impose rest. Last-set confirmation and end time are captured at the user action; if persistence fails, preserve the candidate timestamp for a retry so elapsed duration does not silently grow during save errors.

At hydration, reconcile an expired deadline into next set ready once; persist through the controller. Ensure intervals and React effect re-execution cannot apply the transition or alert twice.

### Local interruption

On startup validate the draft and offer Resume, End and review, or Discard; an already ended draft offers Review. An explicitly paused rest stays paused. A running rest is reconciled against now. Require user action before continuing set entry. Do not auto-complete sets or play old alerts.

An interruption does not automatically imply a workout pause. Unpaused time away remains in calculated elapsed duration because the app cannot know when exercise stopped. Explain this on recovery and offer duration correction in Review. This policy is separate from backup import, which freezes the restored draft at export time.

## 8. Timer design

Running remaining milliseconds = maximum of zero and deadline minus current wall-clock time. Display seconds rounded up so the UI does not show zero before expiry. A foreground interval around 250 ms redraws the display; it is not the clock and never drives persisted per-second writes.

Reconcile on visibility change, focus, page restoration, and initialization. Browser throttling and screen locking can suspend execution. Timestamp reconciliation fixes the displayed elapsed countdown after return; it does not make background alarms reliable.

Elapsed workout time = end/current time minus start time minus explicit whole-workout pauses, including an open pause up to end/current time. Rest and unpaused delays are included. Review time is excluded. Label this Workout elapsed time, not active exercise time.

Sound/vibration are optional, off by default, and enabled/tested from user gestures. Feature-detect support and catch rejected operations. Alert at most once when a rest expires while the page is visibly active. On return from the background, show the ready state without replaying a missed alarm. Never promise operating-system notifications or reliable background sound/vibration.

Wall-clock changes can affect timers. Do not build automatic clock-jump detection in version 1. Clamp countdown display to zero at expiry; validate impossible saved durations, show an explanatory correction prompt when needed, and allow reset of remaining rest and correction of session duration. Do not silently persist a negative duration. There is no claim of timing accuracy across arbitrary clock manipulation.

## 9. Storage and backup strategy

### IndexedDB

One database with `sessions`, `drafts`, `preferences`, `metadata`, and `recovery` stores. Sessions keyed by UUID, with program ID and start timestamp indexes. Drafts use one well-known slot. Recovery contains only the latest pre-import snapshot.

Use a small repository with explicit operations: load dataset, create/update draft, finalize session, edit/delete session, update preferences, capture export, preview/apply import, and restore recovery. No generic adapter framework is required. Keep this boundary so a later cloud service does not require components to know storage details.

### Save policy

Confirmed set results, skips, pause changes, rest changes, and summary saves commit immediately. Unconfirmed typing debounces approximately 300 ms, flushes on blur/confirmation or before a controlled departure, and may lose the newest keystrokes on abrupt termination. Confirmed results must already be persisted.

Disable only relevant mutating actions during writes. Show saving/error/saved status without blocking reading. On failure preserve the input and prior committed record, offer Retry, and do not advance. If storage cannot initialize, block new tracked workouts; browsing program information still works. Do not silently switch to memory storage.

Validate persisted data on load. Unsupported future versions or corruption produce a recovery screen with raw export where feasible; do not delete the database. Handle blocked schema upgrades by asking other tabs to close/reload.

### Concurrency

Every user-data mutation increments a dataset revision and compares the expected revision within the same transaction. A stale write aborts. Reload current state, preserve unsaved text separately where possible, and explain that another tab changed the data. Do not replay stale commands automatically.

Revalidate on tab focus. BroadcastChannel is optional convenience, not required for correctness. No tab leases or heartbeats. An import preview is bound to the revision it read; any intervening mutation requires preview refresh.

### Export

Flush pending input, then read a consistent transaction snapshot. Include all user records, preferences, and draft. Set `exportedAt` consistently with that snapshot. Validate before download. Suggested filename: `fitness-tracker-backup-YYYY-MM-DD-HHmm.json`.

Use a Blob/object URL and revoke the URL after download initiation, not prematurely. Provide a usable fallback link when mobile download behavior differs. Record download initiation, not a claim that the file was physically saved.

No arbitrary session-count limit. For large files, show size and a processing caution; above 25 MiB require an explicit Continue before parsing an import. Do not reject solely on that threshold or create exports the importer rejects by size. Parse/allocation failures must leave existing data unchanged. Validate ordinary field lengths and schema shape to reject malformed content; large-data performance beyond the tested dataset is not guaranteed.

### Import sequence and validation

1. Select file and show name/size.
2. Parse JSON without modifying storage.
3. Check application identifier and version.
4. Migrate supported older formats in memory.
5. Validate schema and semantic invariants.
6. Normalize any imported draft as described below.
7. Calculate merge/replace preview against a consistent local snapshot.
8. Resolve conflicts and confirm.
9. Recheck revision and apply atomically.

Validate uniqueness of IDs within the file; required fields; bounded strings; finite integer counts/durations; timestamps; local date syntax and real calendar dates; allowed target variants; set order/references; outcome/status consistency; draft pointer/phase/rest coherence; snapshot completeness; declared counts; and at most one draft. Saved sessions cannot contain pending sets. Do not deduplicate malformed duplicate IDs silently.

Reject the whole file if invalid, with an actionable error and no partial import. Imported strings are rendered as text; never execute HTML. Only allow vetted HTTP(S) references as links, never JavaScript or arbitrary schemes. Unsupported recording kinds are rejected explicitly.

Current backup version is validated directly. Older formats are accepted only when an actual tested migration exists; do not invent a migration for hypothetical data. Newer unsupported versions are rejected with an update-required message. Database structure upgrades and backup migrations are separate.

Unknown program IDs with valid supported snapshots may be imported into history. Label them as historical programs and keep them available in filters. They do not create executable catalog cards. Drafts can resume from a supported snapshot even if their source catalog entry is missing.

### Restoring a draft from a backup

For an imported active draft, restore it as whole-workout paused at `exportedAt`:

- Calculate remaining running rest at export time, not import time. If already expired at export, the prior phase becomes next set ready.
- If the draft was not paused, start its pause at export time; later resume excludes the entire export-to-resume gap from elapsed duration.
- If already whole-workout paused, preserve its existing pause start and accumulated paused time.
- Preserve independently paused rest as paused when the workout later resumes.
- A Review draft remains Review with its original end time.
- Never automatically start a timer during import.

Keep saved history unchanged. Draft normalization is part of the import preview and is explicitly reported. Validate timestamps needed for normalization; do not silently repair an inconsistent backup.

### Merge

- New session ID: add.
- Same ID with equivalent user content: unchanged. Ignore transport metadata and local revision counters when comparing equivalence.
- Same ID with different user content: explicit conflict. Default Keep local; alternative Use imported.
- Never prefer a record merely because its clock timestamp or local revision is larger.
- Never create a duplicate session automatically to resolve a conflict.
- Keep local preferences by default; imported preferences are an explicit choice.
- If both sources have a draft, require Keep local draft or Use imported draft. If only the backup has a draft, allow restore or omit it explicitly.

On imported updates, assign valid local revision values; imported revision numbers are not concurrency authority. The preview reports additions, unchanged records, conflicts, preference changes, and the retained draft.

### Replace

Show how many local sessions will be removed/replaced, how many arrive, and what happens to preferences and the draft. Require a clearly labeled Replace local data confirmation. Replacement adopts the imported preferences and selected imported draft; no draft in the backup means no draft afterward. Offer Export current data first. No destructive action occurs during validation or preview.

### Atomic import and recovery

During final import preparation, flush input and pause any running local workout with a normal persisted command before creating the definitive preview. Keep mutation controls blocked while applying. A user may cancel after pausing; the local draft remains safely paused.

One transaction must verify the preview revision, write a full pre-import user-data snapshot to recovery, apply the candidate dataset, and increment the dataset revision. Stage parsing/migrations outside the transaction; do not await unrelated operations inside it. Abort everything on any failure, including quota failure while writing the safety copy.

Keep only the latest pre-import snapshot. It excludes prior recovery snapshots. Restore it through an explicit confirmation warning that subsequent changes will be replaced; offer an export of current data first. Restoration is atomic and consumes the recovery snapshot after success. A failed restore leaves it intact. Do not promise a chain of undo operations.

The recovery copy remains on the same device and is not protection against device/browser loss. Explain how to download a backup. Show last export-request time; automatic reminders are deferred.

### Local-storage limitations

Data is tied to the browser profile and exact website origin. Clearing site data, profile removal, device loss, browser eviction, and private browsing can remove it. Different devices, browsers, domains, ports, and Vercel preview URLs have separate data. No automatic synchronization exists. Export from the old origin before a domain change and import on the new one.

Browser transaction completion is not an absolute guarantee against disk or OS failure. Downloaded backups are essential. Do not ask for persistent-storage permissions in version 1; add later only if useful.

## 10. Statistics and analytics

Use saved sessions only; exclude drafts. Program-scoped by default, including historical imported programs. Snapshot prescriptions are the source of historical targets. Corrections, deletions, and imports invalidate derived views immediately.

| Metric | Rule |
|---|---|
| Completed workouts | Saved sessions with all prescribed sets recorded |
| Partial workouts | Separate count; never included in completed count |
| This week | Completed sessions starting in the current Monday–Sunday local-date week |
| Weekly consistency | Completed count per week against approximate goal of three; do not reward consecutive-day streaks |
| Monthly consistency | Completed count and distinct dates with positive recorded repetitions |
| Total repetitions | Sum recorded actual values, including partial sessions |
| Per-session exercise total | Sum recorded results; label incomplete exercise totals |
| Per-set result | Recorded result for matching set number; absent means missing, not zero |
| Best set | Maximum recorded repetitions, including valid results in partial sessions |
| Best full exercise | Maximum exercise total only when all its prescribed sets were recorded |
| Duration | Corrected value if present, otherwise calculated elapsed duration; label corrections |
| Target attainment | Sum capped actual credit / sum prescribed counts for fixed-target sets |

Do not combine duration comparisons of partial and completed workouts without labels; default duration summaries to completed sessions.

### Target formulas and examples

For fixed-target sets, credit = minimum of actual and target; skipped/not-attempted credit = zero. The denominator includes all prescribed fixed-target sets. Qualitative targets have no numeric target and are excluded entirely. When no fixed targets exist, show not applicable, never divide by zero.

- Squats 13/15/20 against 20/20/20: 48 actual, 48 credited, 60 prescribed, 80% attainment.
- Squats 25/15/20: 60 actual, 55 credited, 60 prescribed, approximately 91.7% attainment.
- The whole conditioning program denominator is 240. Push-ups and tibialis raises contribute actual volume but no target percentage.

More repetitions on one set do not cancel a shortfall on another. Logging completion is separate from target attainment. Personal-record copy must not encourage failure.

### Dates and calendar

Store session start/end local dates in its captured time zone. For live sets capture their activity date in that session time zone and their UTC recording timestamp. Preserve these historical date keys after travel. Current-week boundaries use the current local date; filter historical start-date keys consistently, without reprojecting old sessions.

Count each session once using its start date. Calendar can mark activity on every recorded-set date; a session crossing midnight may appear on two dates but remains one workout. Distinguish zero-only logs from positive-repetition training days. A saved session with no recorded sets still appears in the history list on its start date as partial, without an activity-volume marker.

### Charts and dashboard

Default Progress screen: completed count, completed this week, weekly bars, calendar, selected-exercise chart, and that exercise's records. Default time range last 12 weeks; alternatives four weeks and all time.

Push-up chart defaults to best set per session. Options: Set 1 and full-exercise total. Show actual dates and set breakdown in detail. Missing Set 1 is a gap. Full-exercise total excludes incomplete exercise entries. Best set can come from a partial session and must be labeled accordingly. This should clearly show an increase from 5 to 15 over time.

No smoothed invented values. Do not connect missing measurements as if known. For a zero-only dataset, use a sensible nonzero axis range while still plotting zero. Handle empty and one-point datasets. Use deterministic ordering by start timestamp and ID for ties.

Do not compare different exercise variants as identical. Stable exercise IDs must reflect comparable movement definitions; show version/target changes when relevant. Provide a text summary and data table for each chart. Optimize dense all-time rendering only after profiling; do not discard underlying records.

## 11. Proposed directory structure

These paths are implementation guidance, not a requirement to create empty scaffolding for unused features.

| Path | Responsibility |
|---|---|
| `src/app/layout.tsx`, `src/app/page.tsx` | Root shell/providers and Home |
| `src/app/programs/[programId]/page.tsx` | Program overview |
| `src/app/workout/page.tsx` | Workout and recovery |
| `src/app/workout/summary/page.tsx` | Review/save |
| `src/app/history/page.tsx` | Calendar/list |
| `src/app/history/[sessionId]/page.tsx` | Detail/corrections |
| `src/app/progress/page.tsx` | Statistics |
| `src/app/settings/page.tsx` | Preferences/backups |
| `src/app/globals.css` | Tailwind and design tokens |
| `src/components/ui/` | Small shared accessible controls |
| `src/components/programs/` | Cards, overview, guidance |
| `src/components/workout/` | Set input, rest, progress, summary |
| `src/components/history/` | Calendar/list/detail |
| `src/components/charts/` | SVG charts and data tables |
| `src/domain/schemas.ts`, `invariants.ts` | Schemas, inferred types, semantic checks |
| `src/programs/catalog.ts` | Three descriptors |
| `src/programs/beginner-conditioning.ts` | Exact versioned prescription |
| `src/features/workout/machine.ts` | Pure transitions |
| `src/features/workout/controller.ts` | Serialized durable commands |
| `src/features/workout/provider.tsx` | React integration |
| `src/features/workout/timer.ts`, `recovery.ts` | Time calculations and restoration |
| `src/features/statistics/` | Aggregations and chart selectors |
| `src/lib/storage/db.ts`, `repository.ts` | IndexedDB and atomic operations |
| `src/lib/backup/` | Export, validation, migrations, preview/application |
| `src/lib/time/` | Dates, weeks, durations |
| `tests/unit/`, `tests/integration/`, `tests/e2e/` | Focused automated verification |
| `README.md` | Setup, scripts, data limitations, deployment, verified deviations |

Merge tiny closely related modules when it improves clarity. Do not collapse domain logic into React components or create speculative interfaces for future features.

## 12. Implementation roadmap

Implement vertical, verified increments. Complete essential version 1 before enhancements. Do not stop after scaffolding or a static mockup.

### Milestone 1 — Foundation and static shell

- **Objective:** Establish stack, design tokens, routing, and exact program content.
- **Features:** Initialize the application; strict TypeScript; explicit lint/typecheck/test/build scripts; shared controls; responsive navigation; three program cards; program overview.
- **Modules:** App routes, global styles, UI primitives, catalog and conditioning definition.
- **Considerations:** Existing planning document must survive scaffolding. Keep browser APIs behind client boundaries. Lock compatible stable dependencies.
- **Dependencies:** None.
- **Acceptance:** Correct cards/statuses, six exercises in exact order, 18 sets, no hamstring curls, no functional Coming Soon action, responsive layout from 320 to 1,440 px.
- **Verification:** Typecheck, lint, production build, viewport inspection. Test program invariants rather than CSS implementation details.

### Milestone 2 — Domain and storage

- **Objective:** Establish trustworthy records and atomic writes.
- **Features:** Schemas/invariants, snapshots, store creation, repository, revisions, storage errors, preferences.
- **Modules:** Domain, programs, storage.
- **Considerations:** No silent fallback/reset; safe blocked upgrades; transactions cover related writes.
- **Dependencies:** Milestone 1.
- **Acceptance:** Preferences survive restart; snapshots survive catalog changes; stale writes fail; transaction failure preserves prior data.
- **Verification:** Repository tests with fake IndexedDB plus real-browser persistence smoke checks.

### Milestone 3 — Workout engine

- **Objective:** Implement the complete behavioral model before UI complexity.
- **Features:** All transitions, manual reps, skip/end, outcome classification, corrections, duplicate-command protection, serialized input saves.
- **Modules:** Machine, controller, invariants.
- **Considerations:** Pure transitions take explicit time; no React/interval dependency. Obsolete input saves cannot overwrite recorded results.
- **Dependencies:** Milestone 2.
- **Acceptance:** Exact 18-set sequence; 13/20 preserved separately; qualitative targets accept actuals; skipped remains null; double taps cannot duplicate results; final state has no pending sets.
- **Verification:** Table-driven transitions and complete/partial session fixtures including queued input races.

### Milestone 4 — Guided workout, timer, recovery

- **Objective:** Complete the usable mobile workout journey.
- **Features:** Set screen, timer controls, whole-workout pause, elapsed time, draft recovery, pause-and-leave, optional alerts.
- **Modules:** Workout UI/provider/controller, timer, recovery.
- **Considerations:** Timestamp timing, keyboard/safe areas, effect cleanup, write failures, no background-alarm claims.
- **Dependencies:** Milestone 3.
- **Acceptance:** All 18 sets executable; correct rest boundaries; no final rest; reload recovers exercise/rest/pause/review; hidden expiry reaches ready; explicit pauses preserve correct time; failed writes do not advance.
- **Verification:** Browser workflows, simulated clock tests, responsive inspection, real-phone testing where available. Report unavailable device checks honestly.

### Milestone 5 — Summary and history

- **Objective:** Save and inspect accurate performance.
- **Features:** Review, atomic save, list/calendar, details, corrections including mistaken skips, duration correction, confirmed deletion.
- **Modules:** Summary/history routes, UI, repository.
- **Considerations:** Stable IDs; no fabricated activity timestamps; prescription immutable; review time excluded.
- **Dependencies:** Milestone 4.
- **Acceptance:** Completed/partial labels accurate; repeated Save creates one record; edits update outcome; refresh retains history; missing-record routes are clear.
- **Verification:** Full/partial/zero/skipped journeys, save failure, correction and deletion tests.

### Milestone 6 — Backup and restoration

- **Objective:** Protect user data before release.
- **Features:** Consistent export, validation, version handling, merge conflicts, replacement, draft freeze on import, atomic recovery copy and restoration.
- **Modules:** Backup services, Settings, repository.
- **Considerations:** No mutation during validation; stale preview rejection; no imported timer starts; self-exported data remains accepted; quota aborts everything.
- **Dependencies:** Milestone 5.
- **Acceptance:** Round-trip preserves equivalent user records; repeated merge has no duplicate sessions; invalid/newer files change nothing; conflicts explicit; drafts restore paused at export time; failed import preserves current data; recovery restoration works.
- **Verification:** Known fixtures and browser-to-browser/profile export/import. Test days-later restoration and an already-paused draft.

### Milestone 7 — Statistics and guidance

- **Objective:** Deliver useful, comprehensible progress views.
- **Features:** Metric selectors, filters, weekly bars, exercise chart, records, target attainment, recovery guidance.
- **Modules:** Statistics, charts, Progress, program overview.
- **Considerations:** Missing versus zero; qualitative target exclusion; dates; incomplete exercises; historical programs.
- **Dependencies:** Milestone 5; Milestone 6 required before release.
- **Acceptance:** Partial reps count but partial workouts do not count as completed; examples produce 80% and approximately 91.7%; 5-to-15 push-up improvement visible; edits/imports update every affected view; no consecutive-day streak incentive.
- **Verification:** Known-answer analytics tests, date boundary fixtures, chart/table comparison.

### Milestone 8 — Release readiness

- **Objective:** Deliver a verified, deployment-ready version 1.
- **Features:** Accessibility/responsive review; multi-tab, error and import hardening; 5,000-session fixture; README; production build; deployment configuration.
- **Modules:** Cross-cutting tests and documentation.
- **Considerations:** Preserve existing user files; preview/production origins differ; do not deploy or push without explicit authorization.
- **Dependencies:** Milestones 1–7.
- **Acceptance:** All essential behavior complete; required checks pass; no external workout-data transmission or service worker; local limitations visible; no unresolved data-loss bug.
- **Verification:** Typecheck, lint, unit/integration/E2E, build, manual browser smoke test, export/import round-trip. If deployment is authorized, repeat smoke testing on the stable production origin.

### Deferred enhancements

Backup reminders; persistent-storage permission requests; custom programs; multiple workout-template picker; additional recording types; advanced chart interaction; optional cloud synchronization. Do not spend version 1 effort on them unless later explicitly requested.

## 13. Testing and quality assurance

### Core domain

Test exact prescription/order and exclusion; fixed/qualitative target variants; blank/zero/decimal/negative/exponent/oversized input; skip current/remaining exercise; early end before and after activity; no final rest; duplicate taps; invalid phase commands; all-zero logging; correction of skipped records; delayed input persistence after confirmation.

### Timers

Use an injected clock, not slow real-time waits. Test 90-second start; pause after 20 and resume at 70; extend running/paused timers; rest pause versus workout pause; whole pause while rest already paused; zero duration; upper bound; hidden expiry; reload before/after expiry; no duplicate/replayed alerts; elapsed time excluding explicit pauses/review; invalid wall-clock duration handling.

### Persistence

Refresh during typing, after confirmation, during rest/pause/review. Test final-save transaction failure, full/unavailable storage, blocked upgrade, corruption, future schema, two tabs recording the same set, stale text writes, and back navigation. Browser storage failures must not cause automatic data deletion.

### Backups

Test empty and valid backups, malformed JSON, wrong app, unsupported future version, real supported migrations when introduced, duplicate IDs, invalid references/statuses/timestamps/targets, conflicting sessions/drafts, unknown historical programs, unsupported recording kinds, days-later draft restoration, already paused/expired/Review drafts, quota failure, stale preview, cancellation, replace then recovery, and restoration failure preserving the recovery snapshot.

Round-trip comparison ignores local revisions and expected draft normalization, but must preserve user records, targets, preferences, and elapsed time up to export. Repeated imports must not duplicate saved sessions.

### Statistics

Known fixtures for completed/partial/zero/skipped data, missing sets, same-date sessions, midnight, week/month/year boundaries, DST-aware calendar arithmetic, travel, historical unknown programs, target versions, ties, edits/deletion, over-target reps, qualitative-only exercise targets, empty and one-point charts.

Use calendar arithmetic for dates and week ranges rather than assuming every day is exactly 86,400,000 ms. Validate leap days. Avoid parsing date-only strings through UTC in a way that shifts their local display.

### Browser and accessibility

Target current iOS Safari, Android Chrome, and modern desktop browsers. Test numeric keyboard, sticky actions with keyboard open, safe areas, portrait/landscape, zoom/text scaling, locked screen, returning from the external demonstration, screen-reader order, live regions, keyboard focus, modal focus, reduced motion, contrast, and chart tables.

Automation does not prove real-device background alerts work. Clearly report checks not performed. Test the production build, not only the development server. Add focused tests for important behaviors, not tests that merely restate styling or framework implementation.

### Release gate

Typecheck, explicit lint, unit/integration tests, critical E2E tests, production build, browser smoke test, and backup round-trip must pass. A successful build alone is insufficient. Re-run affected checks after fixes; avoid repeating unrelated suites without a reason.

## 14. Deployment and maintenance

Use Vercel's Next.js preset and ordinary deployment, not a forced static export. Dynamic session detail routes read browser-local data client-side; they do not require a server data API. No application secrets or hosted database credentials are needed.

Vercel Hobby is intended for personal/noncommercial projects under its current terms. Verify current support and limits when deploying. Free hosting is not unlimited. Avoid analytics and paid features.

When explicitly authorized to deploy: connect the selected repository, use a supported Node LTS and lockfile, run the full release gate, validate a preview, deploy production on a stable origin, then test direct routes, full workout, persistence, and backup restoration there. Do not confuse preview data with production data.

Maintain patched stable dependencies. Test migrations against prior supported backups. Keep explicit app/backup/prescription versions. Favor additive storage changes. A code rollback does not reverse a storage migration; do not promise rollback compatibility without testing. Explain domain changes before users lose access to the old origin's data.

README must describe setup, commands, architecture boundaries, local persistence limits, backup/import/recovery, timer limitations, verified browser checks, deployment steps, and any material deviation from this blueprint.

## 15. Future expansion

### Programs

When a real pull-up prescription exists, define and validate it, enable its catalog entry, and reuse the engine/UI. Do not invent its exercises now. Repetition-based programs should require mostly configuration, not a separate application.

### Recording kinds

Timed holds, distance, external load, left/right results, and interval rounds are future discriminated variants. Each needs target/result validation, input UI, summary, analytics, and backup compatibility. Do not fill every version 1 record with unused optional fields.

### Cloud synchronization

Repository boundaries, UUIDs, snapshots, and schemas reduce future rewriting. Sync still requires authentication, ownership, authorization, server storage, conflict policy, deletion tombstones, upload/download coordination, consent, and account removal. Do not claim local revision integers solve distributed synchronization. Keep local storage and add sync behind the repository when actually requested.

### Other options

Future custom-program editing, multiple templates, schedules, session notes, cross-program exercise comparison, richer charts, and optional accounts should follow demonstrated needs.

## 16. Reference documentation

Use official documentation to resolve version-specific setup when implementation begins. These sources informed the blueprint; they do not override product requirements.

- Next.js setup: https://nextjs.org/docs/app/getting-started/installation
- Client boundaries: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Tailwind Next.js integration: https://tailwindcss.com/docs/installation/framework-guides/nextjs
- idb: https://github.com/jakearchibald/idb
- Zod: https://zod.dev/
- IndexedDB transactions: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- Storage limitations: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Background timer behavior: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- Audio restrictions: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay
- Vibration support: https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API
- Vercel Hobby: https://vercel.com/docs/plans/hobby

## 17. Definition of done for the executing agent

Essential version 1 is complete when the exact program works end to end on mobile, actual results and targets remain separate, interruptions recover safely, timing follows the stated limits, completed/partial history and statistics are accurate, validated backups round-trip and handle conflicts atomically, and required checks pass.

Leave the application runnable with clear commands and a concise implementation report. Report actual tests and remaining limitations honestly. Do not substitute a static mockup for working storage and workout behavior. Preserve this plan, do not silently weaken requirements, and do not implement deferred features to avoid finishing core ones.
