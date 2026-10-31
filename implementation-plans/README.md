# Implementation plans

| Document | Purpose |
|---|---|
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Original version 1 specification, moved here with identical contents |
| [VERSION_2_IMPLEMENTATION_PLAN.md](VERSION_2_IMPLEMENTATION_PLAN.md) | Reviewed version 2 design: accounts, saved-data sync, safe migration, private program editor |
| [SUPABASE_SETUP.md](SUPABASE_SETUP.md) | Owner setup, email delivery, database migrations, Vercel connection, and progress verification |

The current app is version 1. Version 2 is planned, not implemented. The user approved syncing saved workouts while keeping unfinished workouts on their starting device. No cloud account/project was created and no workout was uploaded during planning.

The real backup and its verification manifest are in this machine's Git-ignored `.private/backups/` directory. Preserve them locally; do not stage personal workout data. On another machine, the original file must be supplied privately for final migration verification.

## Prompt for Sol

Copy the following into Sol when you want implementation to start:

```text
Implement version 2 of FORM in C:\vibe-code\workout-app. I authorize application implementation now, but not commits, pushes, deployment, hosted database changes, or uploading my personal workout to a cloud account without my separate explicit authorization.

First inspect the repository and applicable AGENTS.md instructions. Read implementation-plans/VERSION_2_IMPLEMENTATION_PLAN.md and implementation-plans/SUPABASE_SETUP.md completely. Read the original implementation-plans/IMPLEMENTATION_PLAN.md for unchanged version 1 behavior. Version 2 is the source of truth where it explicitly supersedes version 1. Preserve all plan files and existing user files.

Complete all eight version 2 milestones: email/password authentication, account-isolated Supabase persistence, durable synchronization of saved workouts/programs/preferences, explicit conflict and deletion handling, lossless v1 migration and validated v2 backups, a complete private program editor, and release verification. Keep unfinished workouts local to their starting device, as I explicitly chose. Preserve the working app's recording, timers, recovery, history, statistics, and safeguards. Do not stop after login, scaffolding, SQL migrations, or a static editor.

My real backup is C:\Users\musay\Downloads\fitness-tracker-backup-2026-10-29-1108.json. A verified private copy and manifest are under .private/backups/. Inspect them locally if available; never commit their contents, include them in a bundle/seed, log them, or preload them into every account. Retain every session/set identity and original result, date, target, note, and duration. Add a reviewed account migration and read-back verification so later workouts append to the same history without duplicates. Use synthetic fixtures in committed tests. If the private file is unavailable, finish independent implementation and report the actual-data verification as pending.

Use the existing Next.js, TypeScript, Tailwind, IndexedDB, idb and Zod architecture, plus the planned Supabase packages. Choose compatible stable pinned dependencies and follow current official documentation. Avoid deferred features and unnecessary dependencies. Keep the bundled mentor baseline exact; edits create personal versions and never rewrite historical or active workout snapshots.

Implement the plan's local transaction/outbox, idempotency, per-account revision checks, stable paged pulls, RLS/RPC authorization, tombstones, account-switch isolation, import staging, and recovery requirements. Never silently overwrite a conflict or treat a failed/unknown upload as synced. Preserve local merge/replace recovery; account imports use reviewed merge only.

Work autonomously through routine details. Keep me updated. Ask only for genuine blockers or choices that materially change scope; continue independent work when hosted credentials/setup are missing. Use a disposable local Supabase stack or an explicitly designated development project for real database tests, never my production data. On this machine dependencies were installed in WSL; follow the README's Windows/WSL guidance.

Run typecheck, lint, meaningful unit/integration tests, real Supabase authorization and concurrency tests, production build, and browser verification with two independent contexts. Verify v1 backup preservation, repeat-import deduplication, account isolation, offline/retry/conflict flows, program versioning, and the large dataset. Fix failures. Do not claim cloud readiness from mocked tests alone; report checks you could not perform honestly.

Provide tested SQL migrations, .env.example without credentials, setup/test commands, and an updated README and Supabase setup guide. Leave the app runnable locally. Finish with a concise implementation report, verification evidence, material deviations, and the exact remaining Supabase/Vercel/email/migration steps I must perform. Do not commit, push, or deploy.
```
