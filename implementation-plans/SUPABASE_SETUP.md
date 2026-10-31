# Supabase setup and safe rollout for FORM version 2

**Updated 31 October 2026.** Version 2 application code, local configuration, and migrations are delivered. Local application and embedded PostgreSQL checks have passed; hosted setup, real Supabase authentication/email delivery, and the owner’s cloud migration remain unverified. Local mode works without Supabase variables.

The work is split into two parts: Sol builds and tests the integration; you create/configure the hosted services and approve the actual account migration. Your existing workout is imported through your signed-in account, never through a shared seed file.

## 1. Keep your existing workout safe

Keep the original Downloads backup. A verified additional copy is in this machine's ignored `.private/backups/` directory. Neither copy has been uploaded to a service by this planning task. The private verification manifest includes the exact expected values for checking the migration. This safety copy is on the same computer, so keep another copy somewhere you can recover independently of that computer.

Before upgrading the app, export again from the browser/origin you actually use, especially if you record more workouts after the supplied backup. Use the newest export for the main migration and keep the older one as a cross-check. Do not clear site data, remove the old app's storage, or delete these files to troubleshoot sign-in or synchronization.

## 2. Create your Supabase project

1. Sign into the [Supabase dashboard](https://supabase.com/dashboard). Create an organization/project for this app. A name such as `form-production` is sufficient.
2. Choose an appropriate nearby region, save the database password in your password manager, and wait for provisioning. Check current plan quotas and pricing before choosing a plan; no subscription purchase is assumed here.
3. Open the project's **Connect** dialog/API-key settings and find the **Project URL** and **publishable key** (`sb_publishable_...`). The publishable key is designed for browser use with access policies; it is not a password. Do not put a secret key, legacy `service_role` key, database password, or personal access token into browser variables. [API keys](https://supabase.com/docs/guides/getting-started/api-keys).
4. Record the project reference for CLI linking. Keep production separate from test data. Sol should normally use a local Supabase stack; a separate hosted development project is an alternative. Friends are app users, not Supabase organization administrators.

No Storage bucket, Realtime publication, Edge Function, OAuth client, or extra backend server is needed by this plan.

## 3. Configure email login and real email delivery

In Supabase Authentication settings, enable **Email** authentication and **Confirm email**. Permit new user sign-ups if you want friends to register themselves. Keep the supported password-security settings and rate limits enabled. The app provides registration, login, confirmation, forgotten password, and reset forms.

**Configure custom SMTP before expecting friends to receive emails.** Supabase's default sender is a restricted testing service and generally sends only to addresses on the Supabase project team. Do not add friends as project administrators to bypass that restriction. Configure a transactional email provider in Authentication → SMTP settings with its host, port, username, password, verified sender address, and sender name. Provider/domain verification may require DNS records such as SPF/DKIM. Those credentials belong in Supabase's SMTP configuration, not Vercel's public environment variables. [Supabase SMTP instructions](https://supabase.com/docs/guides/auth/auth-smtp).

The provider is your choice; use one whose costs and sending limits suit your usage. A verified sending domain may be required by that provider. This guide does not promise free unlimited email. Test confirmation and password reset to a real non-team email address before inviting friends. Disable email click tracking/link rewriting if it interferes with authentication links; inspect spam folders and Supabase auth/email logs for delivery failures. Do not disable email confirmation merely to hide a delivery problem.

## 4. Set site and redirect URLs

After choosing your stable production domain, go to Authentication → URL Configuration:

- **Site URL:** `https://YOUR-PRODUCTION-DOMAIN`.
- Allow the production confirmation URL: `https://YOUR-PRODUCTION-DOMAIN/auth/confirm`.
- Allow local development: `http://127.0.0.1:3000/auth/confirm`.
- Add `http://localhost:3000/auth/confirm` only if you actually use that local origin.
- Use a separate development Supabase project for preview deployments, with its own explicitly allowed preview callback URL. Do not grant broad production wildcards just to make arbitrary Vercel previews work.

The application's configured origin must match the site being used. A `localhost` callback opened on a phone points to that phone, not your laptop. Use the production HTTPS origin for real cross-device tests. [Redirect URL documentation](https://supabase.com/docs/guides/auth/redirect-urls).

### Email template contract for Sol's implementation

**Default-template support:** The app now also accepts Supabase's default confirmation/password-recovery links. For personal testing with the built-in sender, leave the existing templates unchanged and open links in the same browser where you requested them. Those links use a browser-bound authorization code. A confirmation opened elsewhere may require signing in manually afterward; for password recovery, request/open the link in the same browser. The customized token-hash links below remain supported when custom SMTP/template editing is configured. Custom SMTP is required for normal delivery to friends/non-team addresses, not merely for testing your own project-team email.

This plan uses a server `/auth/confirm` route accepting `token_hash` and a fixed token `type`. The app passes the full allowed callback URL, `${NEXT_PUBLIC_APP_URL}/auth/confirm`, in both signup `emailRedirectTo` and reset-password `redirectTo`. It contains no query string. Configure these links in Authentication → Email Templates after Sol implements that route:

**Confirm sign up**:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">Confirm your email</a>
```

**Reset password**:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Reset your password</a>
```

The route verifies the token server-side and sends the user to Home or `/auth/reset-password`, respectively. It must remove the token from the displayed URL and reject open redirects. Sol must test the actual templates, including clicking in another browser and expired links; do not mix these templates with a different callback implementation. [Template variables](https://supabase.com/docs/guides/auth/auth-email-templates).

If you change the domain, update Site URL, callback allowlists, application environment variables, and test both flows again. During a transition, preserve the old origin long enough to export any unsynced/local-only data.

## 5. Local implementation and database testing

Use the same OS environment for installing and running project dependencies. On this machine the current `node_modules` installation is for Linux/WSL. The existing README explains the earlier Windows/WSL native-dependency and VPN issues. Do not fix a network timeout by deleting the lockfile or disabling TLS verification.

The repository now includes pinned Supabase SDK/CLI dependencies, SQL migrations, local config/templates, `.env.example`, and test commands. Docker and Podman were unavailable during implementation. Embedded PostgreSQL tests execute real SQL with a simulated auth identity; they do not replace testing Supabase Auth and the HTTP API.

For a local Supabase test stack, install/start a supported container runtime, normally Docker Desktop with WSL integration enabled for your development distribution. The CLI runs the services locally. Use the exact pinned CLI from the implemented project:

```sh
npm ci
npx supabase start
npx supabase migration up
npx supabase test db
npm run test:db
```

`supabase init` is a one-time authoring step for Sol if `supabase/config.toml` is absent; do not reinitialize a delivered configuration. Read the CLI output for local API and test-email inbox addresses. Keep local keys and synthetic accounts separate from production. Fresh-database/reset tests are only for a disposable local test stack. Never run a reset against production or a database containing your workout.

These commands are based on the [CLI guide](https://supabase.com/docs/guides/local-development/cli/getting-started) and [migration workflow](https://supabase.com/docs/guides/deployment/database-migrations). Sol must provide the exact final app/SQL test commands and report if Docker or an actual database was unavailable.

## 6. Apply the reviewed schema to the hosted project

Review the implementation verification limits in README first. Test the delivered migrations in a disposable local/development stack before production. Then, from the project directory, link to the intended hosted project:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list
npx supabase db push --dry-run
```

Confirm that the project reference is the intended destination and the pending files match Sol's reviewed migrations. Then apply:

```sh
npx supabase db push
```

CLI login/database credentials are administrative credentials; keep them out of tracked files and chat. Hosted migration application is a separate deliberate step, not an app startup action. Vercel building the repository does **not** apply SQL migrations automatically. [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).

After applying, verify tables, RLS, grants, RPC permissions, and protocol version. Review Supabase's Security Advisor. Run the documented non-destructive auth/permission smoke tests with disposable accounts. Do not paste a generic tutorial schema over the app's migrations, disable RLS to fix a permissions error, or insert your workout through the SQL editor.

## 7. Connect the app locally

After v2 implementation, copy the delivered `.env.example` to `.env.local` and fill in:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

For local database testing use the local stack's URL/key instead; the app origin remains the same. These three names are the implemented environment contract. `NEXT_PUBLIC_APP_URL` is a trusted origin with no trailing path/query, used to construct the allowed auth callback URL.

There is no required runtime `SUPABASE_SERVICE_ROLE_KEY`, secret API key, `DATABASE_URL`, SMTP password, or database password. Normal operations use a user's authenticated session and restricted database functions.

Restart Next.js after changing environment values:

```sh
npm run dev
```

Run the release checks Sol documents, including real Supabase integration tests. Supabase project credentials do not themselves prove migrations or RLS have been applied. If configuration is missing, v2 should retain local recovery/use and display Cloud sync not configured rather than crashing or pretending to upload.

## 8. Configure Vercel and deploy

Once implementation and verification are complete, commit/push when you choose. In the existing Vercel project:

1. Keep the Next.js framework preset, repository root, and the supported Node version documented by the app.
2. Under Settings → Environment Variables, set the same three values for **Production**, using the hosted production Supabase URL/key and `NEXT_PUBLIC_APP_URL=https://YOUR-PRODUCTION-DOMAIN`.
3. Keep Preview/Development values separate and pointed at development services, or leave preview cloud sync explicitly unconfigured. Do not run destructive E2E tests against production.
4. Redeploy after setting/changing environment variables. Browser `NEXT_PUBLIC_` configuration is incorporated at build time; an already-built deployment does not pick up new values automatically. [Vercel environment variables](https://vercel.com/docs/environment-variables).
5. Test signup confirmation, login, password reset, session refresh, direct routes, and a two-device synthetic sync on HTTPS. Confirm that a second account sees no first-account records.

No manual port opening, long-running custom Node server, VPN configuration in Vercel, or Supabase Storage bucket is required. Your phone/computer still needs normal access to the deployed app and Supabase endpoints.

## 9. Bring your existing progress into your account

This step runs **after the new application and schema are ready**:

1. Keep your latest local export and the original protected backup.
2. Open the production app and create/sign into your own account. Verify the email shown in Settings before importing.
3. If using the old browser/origin, review its local-data migration. On a new origin/device, choose Import and select your JSON file. The website cannot automatically read your Downloads folder.
4. Use account **Merge**. Review session counts, equivalent IDs, conflicts, preferences, and any local draft. Do not choose a different conflicting result just to dismiss a warning.
5. Confirm upload to the displayed account. Wait for the cloud read-back check and Synced state. A pending/failed/conflict state means the migration is not verified yet; keep the source and retry/review.
6. On a second browser/device, sign into the **same** account, sync, and inspect the original session in History and Progress. Match every set result, including zero, dates, targets, and duration against the private verification manifest/source file. A correctly displayed total alone is insufficient.
7. Import the original file again as a check: it must report the existing session as equivalent, with no extra workout. Do not blindly confirm if it instead reports an unexpected conflict.
8. Export a new version 2 backup and keep it separately. Continue recording normally. New saved sessions append to this history and synchronize; unfinished workouts remain on their original device, as requested.

If the website's cached data and attached file differ, retain both and review the differences; neither is automatically more correct because its timestamp is later. The app must not overwrite a newer real correction with the older supplied backup.

## 10. Ongoing use, recovery, and friends

Friends use the website's own registration page. They do not need database credentials or Supabase dashboard access. Their programs/history stay private to their app account, subject to the project owner's normal database administration access. This is not end-to-end encryption.

Watch for Saved on device / Waiting to sync before switching devices or clearing storage. Saved-and-synced sessions and programs travel with the account; unfinished workouts, unsent keystrokes and editor scratch drafts do not. There is no promise of synchronization while the app is closed.

Keep independent exports periodically and before major imports, edits or upgrades. Supabase backup access/retention depends on the service plan; the official guidance recommends off-site exports for free-tier projects. [Database backups](https://supabase.com/docs/guides/platform/backups).

Account removal is an owner-admin procedure in this release: first confirm the person's request and export needs, revoke/sign out sessions as appropriate, then delete the correct Auth user through Supabase. App tables must cascade by owner. Previously downloaded files and offline browser copies are not remotely erased; document how the person clears their own device storage after preserving anything needed. Do not delete a whole project to remove one user.

Common diagnoses:

| Symptom | Check |
|---|---|
| Confirmation/reset email missing | SMTP sender verification, non-team recipient test, rate limits, spam/auth logs |
| Email opens the wrong site | Site URL, allowed callback, email template, `NEXT_PUBLIC_APP_URL`; rebuild after changing it |
| RLS/permission/RPC error | Applied migration version, function grants, auth identity; keep RLS enabled |
| Device B has no latest workout | Same account/project, A's upload acknowledgement, B's sync status, unfinished vs saved session |
| Sync conflict | Review both candidates; export before selecting; do not clear cache |
| Supabase paused/unreachable | Restore project/connectivity as applicable; retain local pending records and retry |
| Lost response during import | Resume the saved batch/receipt; do not create a new import blindly |
| Old release rejects local database | Return to v2/export recovery; code rollback is not a data-schema downgrade |

The executor's final README/report must replace any provisional commands with tested ones and explicitly list external setup or device checks still outstanding.

## Implementation verification notes (31 October 2026)

Run `npm run test:db` for the embedded PostgreSQL authorization/transaction suite, `npm run test:db:large` for the 5,000-session synthetic staged merge and paged pull, and `npm test` for the application/storage/sync suites. The large database test takes several minutes in the embedded runtime. Its last measured final commit took about 53 seconds, while per-document validation happens in separate staging requests. The commit RPC has a bounded 55-second function timeout; actual Supabase HTTP performance must be measured in the development project before large production imports. No global timeout is disabled. A timeout leaves the domain transaction atomic and the source/journal available.

With Docker/Podman installed, run `npx supabase start`, `npx supabase migration up`, and `npx supabase test db`, then test signup/confirmation/resend/reset, token expiry, RLS through the real API, and two independent signed-in browsers. The prepared pgTAP permission smoke suite has not been run on the full Supabase stack. Generate database types with `npx supabase gen types typescript --local` after starting that stack if needed.

Run `npm run verify:private` only on the owner’s development machine to recheck the ignored backup checksum and lossless v1/v2 round-trip. It prints a pass/fail summary and performs no upload. A second device and actual account read-back still need to verify the owner’s migration after explicit import approval.
