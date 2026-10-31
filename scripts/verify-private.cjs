/* eslint-disable @typescript-eslint/no-require-imports -- private local verification only */
require("./register-ts.cjs");
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const {
  parseBackup,
  createBackup,
  previewImport,
} = require("../src/lib/backup/index.ts");
const file = ".private/backups/fitness-tracker-backup-2026-10-29-1108.json";
const manifest = fs.readFileSync(
  ".private/backups/MIGRATION_VERIFICATION.md",
  "utf8",
);
const bytes = fs.readFileSync(file);
assert.ok(
  manifest.includes(
    crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase(),
  ),
);
const b = parseBackup(bytes.toString());
const exported = createBackup({
  revision: 0,
  sessions: b.sessions,
  draft: b.draft,
  preferences: b.preferences,
});
assert.deepStrictEqual(exported.sessions, b.sessions);
assert.deepStrictEqual(
  parseBackup(JSON.stringify(exported)).sessions,
  b.sessions,
);
const preview = previewImport(
  {
    revision: 0,
    sessions: b.sessions,
    draft: b.draft,
    preferences: b.preferences,
  },
  b,
  { mode: "merge" },
);
assert.equal(preview.added, 0);
assert.deepStrictEqual(preview.candidate.sessions, b.sessions);
console.log(
  "Private backup checksum, v1 validation, and v2 session round-trip passed. No upload performed.",
);
