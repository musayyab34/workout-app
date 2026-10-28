"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Draft, Session, SetRecord } from "@/domain/schemas";
import { outcomeFor } from "@/domain/invariants";
import {
  correctSet,
  correctDuration,
  parseReps,
} from "@/features/workout/machine";
import { elapsedDuration } from "@/features/workout/timer";
import { useApp } from "@/features/workout/provider";
import { targetLabel } from "@/programs/catalog";
import {
  actualRepetitions,
  targetAttainment,
  exerciseRecords,
} from "@/features/statistics";
import { displayDate, formatDuration } from "@/lib/time";
import { deleteSession } from "@/lib/storage/repository";
import { captureBackup, createDownload, serializeBackup } from "@/lib/backup";
import {
  Badge,
  Button,
  Dialog,
  ErrorText,
  Icon,
  PageHeading,
  Stat,
} from "./ui";
export function SessionDetail({
  record,
  review = false,
}: {
  record: Draft | Session;
  review?: boolean;
}) {
  const app = useApp(),
    router = useRouter();
  const [editing, setEditing] = useState<{
      base: Draft | Session;
      set: SetRecord;
    } | null>(null),
    [status, setStatus] = useState<"recorded" | "skipped" | "not-attempted">(
      "recorded",
    ),
    [reps, setReps] = useState(""),
    [activity, setActivity] = useState(record.startLocalDate),
    [error, setError] = useState(""),
    [durationOpen, setDurationOpen] = useState(false),
    [durationBase, setDurationBase] = useState<Draft | Session | null>(null),
    [seconds, setSeconds] = useState(""),
    [note, setNote] = useState(""),
    [deleteOpen, setDeleteOpen] = useState(false),
    [discardOpen, setDiscardOpen] = useState(false),
    [fallback, setFallback] = useState<{
      url: string;
      filename: string;
    } | null>(null);
  const downloadRef = useRef<ReturnType<typeof createDownload> | null>(null);
  useEffect(
    () => () => {
      downloadRef.current?.release();
    },
    [],
  );
  const outcome = outcomeFor(record.sets),
    attainment = targetAttainment(record.sets);
  const calculated =
    "calculatedDurationMs" in record
      ? record.calculatedDurationMs
      : elapsedDuration(record, Date.parse(record.endedAt ?? record.updatedAt));
  const duration = record.correctedDurationMs ?? calculated;
  const counted = (state: string) =>
    record.sets.filter((s) => s.status === state).length;
  const edit = (set: SetRecord) => {
    setEditing({ base: record, set });
    setStatus(
      set.status === "recorded"
        ? "recorded"
        : set.status === "skipped"
          ? "skipped"
          : "not-attempted",
    );
    setReps(set.actualReps === null ? "" : String(set.actualReps));
    setActivity(set.activityDate ?? record.startLocalDate);
    setError("");
  };
  const saveEdit = async () => {
    try {
      if (!editing) return;
      const value = status === "recorded" ? parseReps(reps) : null;
      const next = correctSet(
        editing.base,
        editing.set.id,
        status,
        value,
        activity,
      );
      if (await app.editRecord(next)) setEditing(null);
      else
        setError(
          "The correction could not be saved. Close this dialog to review the storage message, then reopen the latest result.",
        );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Please check this result.",
      );
    }
  };
  const achievements = review
    ? record.snapshot.exercises.flatMap((ex) => {
        const values = record.sets
          .filter((s) => s.exerciseEntryId === ex.id && s.status === "recorded")
          .map((s) => s.actualReps ?? 0);
        if (!values.length) return [];
        const best = Math.max(...values),
          prior =
            exerciseRecords(app.data.sessions, ex.exerciseId, {
              programId: record.snapshot.programId,
            }).bestSet?.value ?? 0;
        return best > prior ? [`${ex.name}: ${best} reps in one set`] : [];
      })
    : [];
  return (
    <>
      <PageHeading
        eyebrow={review ? "Session review" : "Your training log"}
        title={review ? "Every effort counts." : "Session details"}
      >
        {record.snapshot.programName} ·{" "}
        {displayDate(record.startLocalDate, {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}{" "}
        · Prescription v{record.snapshot.programVersion}
      </PageHeading>
      <div className="notice">
        <div>
          <Badge tone={outcome === "completed" ? "mint" : "warning"}>
            {outcome === "completed" ? "All sets recorded" : "Partial workout"}
          </Badge>
          <p>
            {outcome === "completed"
              ? "Every set has a result. This does not mean every repetition target was reached."
              : "Skipped and unattempted sets stay separate from your actual results."}
          </p>
        </div>
        {review && (
          <Button
            disabled={app.busy}
            onClick={async () => {
              if (await app.save())
                router.replace(`/history/${record.id}?saved=1`);
            }}
          >
            Save to History
            <Icon name="check" />
          </Button>
        )}
      </div>
      <div className="stat-grid">
        <Stat
          label="Actual repetitions"
          value={actualRepetitions(record.sets)}
        />
        <Stat
          label="Sets recorded"
          value={`${counted("recorded")} / ${record.sets.length}`}
          detail={`${counted("skipped")} skipped · ${counted("not-attempted")} not attempted`}
        />
        <Stat
          label="Fixed-target attainment"
          value={
            attainment.percent === null
              ? "—"
              : `${Math.round(attainment.percent)}%`
          }
          detail="Qualitative targets excluded"
        />
        <Stat
          label="Workout elapsed time"
          value={formatDuration(duration)}
          detail={
            record.correctedDurationMs !== null
              ? "Manually corrected"
              : "Includes rest; excludes pauses"
          }
        />
      </div>
      {achievements.length > 0 && (
        <div className="new-records">
          <div className="row">
            <Icon name="trophy" />
            <strong>New best recorded sets</strong>
          </div>
          {achievements.map((text) => (
            <p
              key={text}
              style={{ color: "var(--accent)", fontSize: 13, marginTop: 6 }}
            >
              {text}
            </p>
          ))}
        </div>
      )}
      <div className="two-col">
        <section className="card">
          <div className="section-head">
            <h2>Your results</h2>
            <span className="small muted">Target → actual</span>
          </div>
          {record.snapshot.exercises.map((ex) => (
            <div className="review-exercise" key={ex.id}>
              <h3>{ex.name}</h3>
              <p className="small" style={{ marginTop: 6 }}>
                {ex.instructions}
              </p>
              {record.sets
                .filter((s) => s.exerciseEntryId === ex.id)
                .map((set) => (
                  <div className="review-set" key={set.id}>
                    <span>Set {set.setNumber}</span>
                    <span>
                      <span className="muted">{targetLabel(set.target)}</span> →{" "}
                      <strong
                        className={
                          set.status === "recorded" ? "mint-text" : "muted"
                        }
                      >
                        {set.status === "recorded"
                          ? `${set.actualReps} reps`
                          : set.status === "skipped"
                            ? "Skipped"
                            : "Not attempted"}
                      </strong>
                      {set.correctedAt && (
                        <small className="muted" style={{ display: "block" }}>
                          Corrected
                          {set.origin === "manual-correction"
                            ? " · manually added result"
                            : ""}
                        </small>
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      aria-label={`Edit ${ex.name} set ${set.setNumber}`}
                      onClick={() => edit(set)}
                    >
                      Edit
                    </Button>
                  </div>
                ))}
            </div>
          ))}
        </section>
        <aside className="stack">
          <div className="card">
            <h3>A clear picture of your session.</h3>
            <p className="small" style={{ marginTop: 12 }}>
              Your actual results are recorded alongside the prescription from
              this session. Future program changes won’t rewrite these targets.
            </p>
            <hr />
            <p className="small">
              Original calculated duration: {formatDuration(calculated)}.
              {record.correctedDurationMs !== null
                ? ` Corrected to ${formatDuration(record.correctedDurationMs)}.`
                : ""}
            </p>
            {record.durationNote && (
              <p className="small" style={{ marginTop: 8 }}>
                Note: {record.durationNote}
              </p>
            )}
            <Button
              variant="secondary"
              style={{ marginTop: 18 }}
              onClick={() => {
                setDurationBase(record);
                setSeconds(String(Math.floor(duration / 1000)));
                setNote(record.durationNote ?? "");
                setError("");
                setDurationOpen(true);
              }}
            >
              Correct duration
            </Button>
            <p className="small" style={{ marginTop: 12 }}>
              Unpaused time away from the page is included. Correct the duration
              if your session was interrupted.
            </p>
          </div>
          <div className="card">
            <h3>
              {review
                ? "Saved as an unfinished session"
                : "Saved on this device"}
            </h3>
            <p className="small" style={{ margin: "12px 0 18px" }}>
              {review
                ? "Your review is recoverable until you save it to history or discard it."
                : "Download a backup to protect your progress when changing browsers or devices."}
            </p>
            {review ? (
              <Button
                className="full"
                disabled={app.busy}
                onClick={async () => {
                  if (await app.save())
                    router.replace(`/history/${record.id}?saved=1`);
                }}
              >
                Save to History
              </Button>
            ) : (
              <Button
                variant="danger"
                disabled={app.busy}
                onClick={() => setDeleteOpen(true)}
              >
                Delete session
              </Button>
            )}
            {review && (
              <Button
                variant="ghost"
                disabled={app.busy}
                onClick={() => setDiscardOpen(true)}
                style={{ marginTop: 12 }}
              >
                Discard unfinished workout
              </Button>
            )}
          </div>
        </aside>
      </div>
      <Dialog
        open={editing !== null}
        title="Correct set result"
        onClose={() => setEditing(null)}
      >
        <div className="stack">
          <label className="field">
            <span>Set status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="recorded">Recorded</option>
              <option value="skipped">Skipped</option>
              <option value="not-attempted">Not attempted</option>
            </select>
          </label>
          {status === "recorded" && (
            <>
              <label className="field">
                <span>Actual repetitions</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Activity date</span>
                <input
                  type="date"
                  value={activity}
                  min={record.startLocalDate}
                  max={record.endLocalDate ?? record.startLocalDate}
                  onChange={(e) => setActivity(e.target.value)}
                />
              </label>
            </>
          )}
          <p>The original target stays unchanged. Timers are not replayed.</p>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button disabled={app.busy} onClick={() => void saveEdit()}>
            Save correction
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={durationOpen}
        title="Correct workout duration"
        onClose={() => setDurationOpen(false)}
      >
        <div className="stack">
          <label className="field">
            <span>Elapsed duration in whole seconds</span>
            <input
              type="text"
              inputMode="numeric"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Note (optional)</span>
            <textarea
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {error && <ErrorText>{error}</ErrorText>}
        </div>
        <div className="dialog-actions">
          <Button
            variant="secondary"
            disabled={app.busy}
            onClick={async () => {
              if (
                durationBase &&
                (await app.editRecord(
                  correctDuration(durationBase, null, null),
                ))
              )
                setDurationOpen(false);
            }}
          >
            Use original
          </Button>
          <Button
            disabled={app.busy}
            onClick={async () => {
              try {
                if (
                  !/^\d+$/.test(seconds) ||
                  !Number.isSafeInteger(Number(seconds) * 1000)
                )
                  throw new Error(
                    "Enter a nonnegative whole number of seconds.",
                  );
                if (
                  durationBase &&
                  (await app.editRecord(
                    correctDuration(
                      durationBase,
                      Number(seconds) * 1000,
                      note || null,
                    ),
                  ))
                )
                  setDurationOpen(false);
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Check duration.",
                );
              }
            }}
          >
            Save duration
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={deleteOpen}
        title="Delete this session?"
        onClose={() => setDeleteOpen(false)}
      >
        <p>
          {record.snapshot.programName}, {displayDate(record.startLocalDate)}.
          This removes this session from this browser. Export first if you may
          need it later.
        </p>
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              await app.flushInput();
              const file = createDownload(
                serializeBackup(await captureBackup()),
              );
              downloadRef.current?.release();
              downloadRef.current = file;
              setFallback(file);
            } catch (cause) {
              setError(
                cause instanceof Error ? cause.message : "Export failed",
              );
            }
          }}
        >
          Export backup first
        </Button>
        {fallback && (
          <p>
            <a
              href={fallback.url}
              download={fallback.filename}
              className="text-link"
            >
              Download backup again
            </a>
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
            Keep session
          </Button>
          <Button
            variant="danger"
            disabled={app.busy}
            onClick={async () => {
              if (
                await app.mutate((data) =>
                  deleteSession(data.revision, record.id),
                )
              )
                router.replace("/history");
            }}
          >
            Delete session
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={discardOpen}
        title="Discard this workout?"
        onClose={() => setDiscardOpen(false)}
      >
        <p>
          This deletes the unfinished session and its results. Saved history is
          unaffected. Save to History first if you want to keep these results.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setDiscardOpen(false)}>
            Keep review
          </Button>
          <Button
            variant="danger"
            disabled={app.busy}
            onClick={async () => {
              if (await app.discard()) {
                app.acceptRecovery();
                router.replace("/");
              }
            }}
          >
            Discard workout
          </Button>
        </div>
      </Dialog>
    </>
  );
}
