"use client";
import { AccountPanel } from "@/components/account-panel";
import { useAccount } from "@/features/auth/runtime";
import { applyAccountImport } from "@/features/sync/import";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset, Preferences } from "@/domain/schemas";
import { useApp } from "@/features/workout/provider";
import { transition } from "@/features/workout/machine";
import { armAudio, playAlert } from "@/features/workout/alerts";
import {
  captureBackup,
  createDownload,
  serializeBackup,
  parseBackup,
  previewImport,
  applyImport,
  LARGE_FILE_WARNING_BYTES,
  type Backup,
  type ImportOptions,
  type ImportPreview,
} from "@/lib/backup";
import {
  getRecovery,
  getLastExportRequest,
  recordExportRequest,
  restoreRecovery,
  saveDraft,
  loadDataset,
  type RecoverySnapshot,
} from "@/lib/storage/repository";
import {
  PageHeading,
  Button,
  Icon,
  Dialog,
  ErrorText,
  Badge,
} from "@/components/ui";
export default function Settings() {
  const app = useApp();
  const account = useAccount();
  const [restoreDeleted, setRestoreDeleted] = useState(false);
  const [rest, setRest] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [lastExport, setLastExport] = useState<string | null>(null),
    [recovery, setRecovery] = useState<RecoverySnapshot | null>(null),
    [fallback, setFallback] = useState<{
      url: string;
      filename: string;
    } | null>(null),
    [backup, setBackup] = useState<Backup | null>(null),
    [local, setLocal] = useState<Dataset | null>(null),
    [options, setOptions] = useState<ImportOptions>({ mode: "merge" }),
    [processing, setProcessing] = useState(false),
    [confirm, setConfirm] = useState<"import" | "restore" | null>(null),
    [largeFile, setLargeFile] = useState<File | null>(null),
    [fileName, setFileName] = useState("");
  const downloadRef = useRef<ReturnType<typeof createDownload> | null>(null),
    fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.all([getLastExportRequest(), getRecovery()])
      .then(([last, snapshot]) => {
        if (active) {
          setLastExport(last);
          setRecovery(snapshot);
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to read storage metadata.",
          );
      });
    return () => {
      active = false;
      downloadRef.current?.release();
    };
  }, []);
  const previewResult = useMemo(() => {
    if (!backup || !local) return { preview: null, error: "" };
    try {
      return { preview: previewImport(local, backup, options), error: "" };
    } catch (cause) {
      return {
        preview: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Could not create an import preview.",
      };
    }
  }, [backup, local, options]);
  const preview = previewResult.preview;
  const stale = !!preview && app.data.revision !== preview.expectedRevision;
  const disabled = !app.ready || app.busy || processing;
  const vibrationSupported =
    app.ready && typeof navigator !== "undefined" && "vibrate" in navigator;
  const pauseAndCapture = async () => {
    await app.flushInput();
    const ok = await app.mutate((current) => {
      const draft = current.draft;
      if (draft && draft.phase !== "paused" && draft.phase !== "review")
        return saveDraft(
          current.revision,
          transition(draft, { type: "pause" }),
        );
      return Promise.resolve(current);
    });
    if (!ok)
      throw new Error(
        "The local workout could not be paused safely. Resolve the storage error before importing.",
      );
    return loadDataset();
  };
  const readFile = async (file: File) => {
    setError("");
    setMessage("");
    setProcessing(true);
    try {
      const parsed = parseBackup(await file.text());
      const snapshot = await pauseAndCapture();
      previewImport(snapshot, parsed, { mode: "merge" });
      setBackup(parsed);
      setLocal(snapshot);
      setOptions({ mode: "merge" });
      setFileName(`${file.name} · ${(file.size / 1024).toFixed(1)} KB`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This file could not be processed. No import was applied.",
      );
      setBackup(null);
      setLocal(null);
    } finally {
      setProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const exportAll = async () => {
    setError("");
    setMessage("");
    setProcessing(true);
    try {
      await app.flushInput();
      const exported = await captureBackup();
      const file = createDownload(serializeBackup(exported));
      downloadRef.current?.release();
      downloadRef.current = file;
      setFallback({ url: file.url, filename: file.filename });
      setMessage(
        "Backup download requested. Keep the JSON file somewhere you can recover it later.",
      );
      await recordExportRequest();
      setLastExport(new Date().toISOString());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Backup export failed. Your records have not been removed.",
      );
    } finally {
      setProcessing(false);
    }
  };
  const updatePrefs = async (patch: Partial<Preferences>) => {
    if (patch.soundEnabled) await armAudio();
    await app.preferences({ ...app.data.preferences, ...patch });
  };
  const apply = async (selected: ImportPreview) => {
    setConfirm(null);
    setProcessing(true);
    const ok = await app.mutate(async () => {
      if (account.owner) {
        const next = await applyAccountImport(
          selected,
          account.owner,
          restoreDeleted,
        );
        if (!next) throw new Error("Import not completed");
        return next;
      }
      return applyImport(selected);
    });
    if (ok) {
      setMessage(
        `Import complete. ${selected.candidate.sessions.length} saved sessions are now on this browser. A pre-import recovery copy is available below.`,
      );
      setBackup(null);
      setLocal(null);
      try {
        setRecovery(await getRecovery());
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load recovery status.",
        );
      }
    }
    setProcessing(false);
  };
  return (
    <>
      <PageHeading
        eyebrow="Make it yours"
        title="Your training. Your settings."
      >
        Simple preferences and a safe place for your progress.
      </PageHeading>
      <AccountPanel />
      {account.owner && backup && (
        <label className="card">
          <input
            type="checkbox"
            checked={restoreDeleted}
            onChange={(e) => setRestoreDeleted(e.target.checked)}
          />{" "}
          Explicitly restore deleted account sessions found in this backup.
          These will reappear on other devices.
        </label>
      )}
      {message && (
        <div className="notice" role="status">
          <p>{message}</p>
        </div>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="settings-grid">
        <section className="card settings-card">
          <h2>
            <Icon name="clock" />
            Workout preferences
          </h2>
          <p>
            Applied to new workouts. An active session keeps its own rest
            setting.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const value =
                rest ?? String(app.data.preferences.defaultRestSeconds);
              if (!/^\d+$/.test(value) || Number(value) > 900) {
                setError("Rest must be a whole number from 0 to 900 seconds.");
                return;
              }
              if (
                await app.preferences({
                  ...app.data.preferences,
                  defaultRestSeconds: Number(value),
                })
              ) {
                setMessage("Default rest saved.");
                setError("");
                setRest(null);
              }
            }}
          >
            <div className="setting-row">
              <div>
                <strong>Default rest</strong>
                <p>0–900 seconds · app default: 90</p>
              </div>
              <input
                aria-label="Default rest seconds"
                type="text"
                inputMode="numeric"
                value={rest ?? String(app.data.preferences.defaultRestSeconds)}
                onChange={(e) => setRest(e.target.value)}
                maxLength={3}
              />
            </div>
            <Button variant="secondary" disabled={disabled} type="submit">
              Save rest preference
            </Button>
          </form>
          <div className="setting-row">
            <div>
              <strong>Rest sound</strong>
              <p>A short tone when the page is active.</p>
            </div>
            <input
              type="checkbox"
              aria-label="Enable rest sound"
              checked={app.data.preferences.soundEnabled}
              disabled={disabled}
              onChange={(e) =>
                void updatePrefs({ soundEnabled: e.target.checked })
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Vibration</strong>
              <p>
                {vibrationSupported
                  ? "A brief pulse on supported devices."
                  : "Unavailable in this browser; visual alerts still work."}
              </p>
            </div>
            <input
              type="checkbox"
              aria-label="Enable rest vibration"
              checked={app.data.preferences.vibrationEnabled}
              disabled={disabled || !vibrationSupported}
              onChange={(e) =>
                void updatePrefs({ vibrationEnabled: e.target.checked })
              }
            />
          </div>
          <Button
            variant="ghost"
            onClick={() => void playAlert(app.data.preferences)}
          >
            Test alert
          </Button>
          <p className="small" style={{ marginTop: 12 }}>
            Sound and vibration depend on browser support and device settings.
            Screen locks and background tabs can suspend alerts.
          </p>
        </section>
        <section className="card settings-card">
          <h2>
            <Icon name="lock" />
            On this browser
          </h2>
          <p>
            Your workout records stay in this browser profile. No account, cloud
            database, or automatic synchronization.
          </p>
          <div className="setting-row">
            <span className="small muted">Saved sessions</span>
            <strong>{app.ready ? app.data.sessions.length : "—"}</strong>
          </div>
          <div className="setting-row">
            <span className="small muted">Unfinished workout</span>
            <Badge tone={app.data.draft ? "warning" : "muted"}>
              {app.data.draft ? "Saved draft" : "None"}
            </Badge>
          </div>
          <div className="setting-row">
            <span className="small muted">Last export requested</span>
            <strong className="small">
              {lastExport
                ? new Date(lastExport).toLocaleDateString()
                : "Not yet"}
            </strong>
          </div>
          <div
            className="notice warning"
            style={{ marginTop: 24, marginBottom: 0 }}
          >
            <div>
              <strong>A backup is your safety net.</strong>
              <p>
                Clearing browser data, using private browsing, losing your
                device, or browser eviction can erase local records. A different
                browser, device, domain, or preview URL has separate data.
                Download a backup before switching.
              </p>
            </div>
          </div>
        </section>
        <section className="card settings-card">
          <h2>
            <Icon name="download" />
            Export your progress
          </h2>
          <p>
            Download every saved session, your preferences, and any unfinished
            workout in one versioned JSON file.
          </p>
          <Button disabled={disabled} onClick={() => void exportAll()}>
            Export backup
            <Icon name="download" size={17} />
          </Button>
          {fallback && (
            <p style={{ marginTop: 16 }}>
              <a
                className="text-link"
                href={fallback.url}
                download={fallback.filename}
              >
                Download backup again ↗
              </a>
            </p>
          )}
          <p className="small" style={{ marginTop: 18 }}>
            A download request doesn’t verify that your file was saved. Keep a
            copy on another device or your own storage.
          </p>
        </section>
        <section className="card settings-card">
          <h2>
            <Icon name="upload" />
            Import a backup
          </h2>
          <p>
            Validate a JSON backup, review changes, and choose merge or replace.
            Your data changes only after confirmation.
          </p>
          <label className="field">
            <span>Backup JSON file</span>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              disabled={disabled}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > LARGE_FILE_WARNING_BYTES) setLargeFile(file);
                else void readFile(file);
              }}
            />
          </label>
          <p className="small" style={{ marginTop: 16 }}>
            After validation, a running local workout is paused to prepare a
            consistent preview. Imported workouts resume paused at their backup
            timestamp.
          </p>
          {processing && (
            <p className="loading" role="status">
              Processing your data…
            </p>
          )}
        </section>
      </div>
      {preview && (
        <section className="card import-preview" style={{ marginTop: 24 }}>
          <div className="section-head">
            <h2>Review import</h2>
            <Badge>{options.mode}</Badge>
          </div>
          <p className="small">
            {fileName}
            <br />
            Exported {new Date(preview.exportedAt).toLocaleString()}
          </p>
          <div className="row wrap" style={{ margin: "22px 0" }}>
            <label className="field">
              <span>Import mode</span>
              <select
                aria-label="Import mode"
                value={options.mode}
                onChange={(e) =>
                  setOptions({ mode: e.target.value as "merge" | "replace" })
                }
              >
                <option value="merge">Merge with local records</option>
                <option disabled={!!account.owner} value="replace">
                  Replace local records
                </option>
              </select>
            </label>
            {options.mode === "merge" && (
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={!!options.applyPreferences}
                  onChange={(e) =>
                    setOptions({
                      ...options,
                      applyPreferences: e.target.checked,
                    })
                  }
                />
                Use imported preferences
              </label>
            )}
          </div>
          <div className="notice">
            <div>
              <strong>
                {preview.added} new · {preview.unchanged} unchanged ·{" "}
                {preview.conflicts.length} conflicts
              </strong>
              <p>
                {preview.candidate.sessions.length} sessions afterward.{" "}
                {preview.removed} local sessions removed. Preferences{" "}
                {preview.preferencesChanged ? "will change" : "stay the same"}.
              </p>
            </div>
          </div>
          {options.mode === "replace" && (
            <div className="notice warning">
              <p>
                Replace local data: {local?.sessions.length ?? 0} local sessions
                will be replaced by {backup?.sessions.length ?? 0} imported
                sessions. Preferences and the selected backup draft will replace
                the local versions.
              </p>
            </div>
          )}
          {preview.conflicts.map((conflict) => (
            <div className="import-conflict" key={conflict.id}>
              <p>
                <strong>{conflict.local.snapshot.programName}</strong> ·{" "}
                {conflict.local.startLocalDate}
                <br />
                Same session ID, different results. Local:{" "}
                {conflict.local.sets.reduce(
                  (n, s) => n + (s.actualReps ?? 0),
                  0,
                )}{" "}
                reps. Imported:{" "}
                {conflict.imported.sets.reduce(
                  (n, s) => n + (s.actualReps ?? 0),
                  0,
                )}{" "}
                reps.
              </p>
              <select
                aria-label={`Resolve session ${conflict.id}`}
                value={conflict.choice}
                onChange={(e) =>
                  setOptions({
                    ...options,
                    sessionChoices: {
                      ...options.sessionChoices,
                      [conflict.id]: e.target.value as "local" | "imported",
                    },
                  })
                }
              >
                <option value="local">Keep local record</option>
                <option value="imported">Use imported record</option>
              </select>
            </div>
          ))}
          {(preview.localDraft || preview.importedDraft) && (
            <div className="import-conflict">
              <p>
                <strong>Unfinished workout</strong>
                <br />
                {preview.localDraft
                  ? `Local: ${preview.localDraft.snapshot.programName}, ${preview.localDraft.startLocalDate}, ${preview.localDraft.sets.filter((s) => s.status === "recorded").length} sets recorded.`
                  : "No local draft."}
                <br />
                {preview.importedDraft
                  ? `Backup: ${preview.importedDraft.snapshot.programName}, ${preview.importedDraft.startLocalDate}, ${preview.importedDraft.sets.filter((s) => s.status === "recorded").length} sets recorded.`
                  : "No backup draft."}
              </p>
              <select
                aria-label="Unfinished workout choice"
                value={
                  options.draftChoice ??
                  (preview.requiresDraftChoice ? "" : preview.draftChoice)
                }
                onChange={(e) =>
                  setOptions({
                    ...options,
                    draftChoice: e.target.value as
                      "local" | "imported" | "none",
                  })
                }
              >
                {preview.requiresDraftChoice && (
                  <option value="" disabled>
                    Choose which draft to retain
                  </option>
                )}
                {preview.localDraft && options.mode === "merge" && (
                  <option value="local">Keep local draft</option>
                )}
                {preview.importedDraft && (
                  <option value="imported">
                    Restore imported draft (paused)
                  </option>
                )}
                <option value="none">No unfinished workout</option>
              </select>
            </div>
          )}
          {preview.draftNormalized && (
            <p className="small" style={{ margin: "15px 0" }}>
              Any restored active draft is paused at export time. Time since the
              backup does not count as training.
            </p>
          )}
          {preview.warnings.map((w) => (
            <ErrorText key={w}>{w}</ErrorText>
          ))}
          {stale && (
            <div className="notice warning">
              <p>
                Local data changed after this preview. Refresh it before
                applying.
              </p>
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    setLocal(await pauseAndCapture());
                  } catch (cause) {
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Unable to refresh preview.",
                    );
                  }
                }}
              >
                Refresh preview
              </Button>
            </div>
          )}
          <div className="row wrap" style={{ marginTop: 22 }}>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => void exportAll()}
            >
              Export current data first
            </Button>
            <Button
              variant={options.mode === "replace" ? "danger" : "primary"}
              disabled={disabled || stale || !preview.canApply}
              onClick={() => setConfirm("import")}
            >
              {options.mode === "merge" ? "Apply merge" : "Replace local data"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setBackup(null);
                setLocal(null);
              }}
            >
              Cancel import
            </Button>
          </div>
        </section>
      )}
      {previewResult.error && <ErrorText>{previewResult.error}</ErrorText>}
      {recovery && (
        <section className="card settings-card" style={{ marginTop: 24 }}>
          <h2>
            <Icon name="history" />
            Before your last import
          </h2>
          <p>
            One recovery copy from{" "}
            {new Date(recovery.capturedAt).toLocaleString()} contains{" "}
            {recovery.dataset.sessions.length} saved sessions. Restoring
            replaces changes made since that import. This copy is on this device
            only.
          </p>
          <div className="row wrap">
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() => void exportAll()}
            >
              Export current data first
            </Button>
            <Button
              variant="danger"
              disabled={disabled}
              onClick={() => setConfirm("restore")}
            >
              Restore pre-import data
            </Button>
          </div>
        </section>
      )}
      <Dialog
        open={confirm !== null}
        title={
          confirm === "restore"
            ? "Restore pre-import data?"
            : options.mode === "replace"
              ? "Replace local data?"
              : "Apply this merge?"
        }
        onClose={() => setConfirm(null)}
      >
        <p>
          {confirm === "restore"
            ? "Your current records and preferences will be replaced by the pre-import copy. Changes since that import will be removed, and the recovery copy is consumed after success."
            : `${preview?.candidate.sessions.length ?? 0} saved sessions will remain after applying this ${options.mode}. ${preview?.preferencesChanged ? "Preferences will change." : "Preferences stay the same."} A pre-import recovery copy is saved atomically.`}
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant={
              confirm === "restore" || options.mode === "replace"
                ? "danger"
                : "primary"
            }
            disabled={disabled}
            onClick={async () => {
              if (confirm === "import" && preview) await apply(preview);
              else {
                setConfirm(null);
                setProcessing(true);
                try {
                  await pauseAndCapture();
                  if (
                    await app.mutate((current) =>
                      restoreRecovery(current.revision),
                    )
                  ) {
                    setRecovery(null);
                    setBackup(null);
                    setLocal(null);
                    setMessage(
                      "Pre-import data restored. The recovery copy has been consumed.",
                    );
                  }
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Restoration failed; existing data is preserved.",
                  );
                } finally {
                  setProcessing(false);
                }
              }
            }}
          >
            {confirm === "restore"
              ? "Restore data"
              : options.mode === "replace"
                ? "Confirm replacement"
                : "Confirm merge"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={largeFile !== null}
        title="Process a large backup?"
        onClose={() => setLargeFile(null)}
      >
        <p>
          This file exceeds 25 MiB. Validation may take time and use substantial
          memory. Existing records stay unchanged until a valid import is
          confirmed.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setLargeFile(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const file = largeFile;
              setLargeFile(null);
              if (file) void readFile(file);
            }}
          >
            Continue
          </Button>
        </div>
      </Dialog>
    </>
  );
}
