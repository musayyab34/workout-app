"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/features/workout/provider";
import { currentSet } from "@/features/workout/machine";
import { countdownSeconds, elapsedDuration } from "@/features/workout/timer";
import { playAlert } from "@/features/workout/alerts";
import { conditioningProgram, targetLabel } from "@/programs/catalog";
import { formatDuration } from "@/lib/time";
import {
  Button,
  Badge,
  Icon,
  Dialog,
  ActionLink,
  Empty,
  ErrorText,
} from "@/components/ui";

type Confirmation = "end" | "skip" | "discard" | "leave" | null;

export default function Workout() {
  const app = useApp();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [options, setOptions] = useState(false);
  const [confirm, setConfirm] = useState<Confirmation>(null);
  const [restEdit, setRestEdit] = useState(false);
  const [restValue, setRestValue] = useState("90");
  const [futureRest, setFutureRest] = useState("90");
  const [localError, setLocalError] = useState("");
  const alerted = useRef(new Set<string>());
  const settling = useRef(new Set<string>());
  const quietUntil = useRef(now + 1200);
  const draft = app.data.draft;

  useEffect(() => {
    const update = () => setNow(Date.now());
    const foreground = () => {
      quietUntil.current = Date.now() + 1200;
      update();
    };
    const timer = setInterval(update, 250);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("pageshow", foreground);
    window.addEventListener("focus", foreground);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("pageshow", foreground);
      window.removeEventListener("focus", foreground);
    };
  }, []);

  useEffect(() => {
    if (draft?.phase === "review") router.replace("/workout/summary");
  }, [draft?.phase, router]);

  useEffect(() => {
    const rest = draft?.rest;
    if (
      draft?.phase !== "resting" ||
      rest?.status !== "running" ||
      rest.deadlineAt === null ||
      now < rest.deadlineAt ||
      app.busy ||
      app.error
    )
      return;
    const key = `${rest.id}:${rest.deadlineAt}`;
    if (settling.current.has(key)) return;
    settling.current.add(key);
    const deadline = rest.deadlineAt;
    const audible =
      !app.recovered &&
      document.visibilityState === "visible" &&
      now >= quietUntil.current &&
      now - deadline < 1200;
    void app
      .command({ type: "tick" })
      .then((ok) => {
        if (!ok) return;
        setRestEdit(false);
        setLocalError("");
        const at = Date.now();
        if (
          audible &&
          !alerted.current.has(key) &&
          document.visibilityState === "visible" &&
          at >= quietUntil.current &&
          at - deadline < 1200
        ) {
          alerted.current.add(key);
          void playAlert(app.data.preferences);
        }
      })
      .finally(() => settling.current.delete(key));
  }, [now, draft, app]);

  if (!app.ready) return null;
  if (!draft)
    return (
      <Empty
        title="A fresh session awaits"
        icon="run"
        action={
          <ActionLink href={`/programs/${conditioningProgram.id}`}>
            View program
            <Icon />
          </ActionLink>
        }
      >
        Choose your program to start a guided workout.
      </Empty>
    );
  if (draft.phase === "review")
    return (
      <Empty
        title="Ready to review"
        action={<ActionLink href="/workout/summary">Review workout</ActionLink>}
      >
        Your session is safely saved as a draft.
      </Empty>
    );

  const set = currentSet(draft);
  const exercise = draft.snapshot.exercises.find(
    (entry) => entry.id === set?.exerciseEntryId,
  );
  const index = draft.snapshot.exercises.findIndex(
    (entry) => entry.id === set?.exerciseEntryId,
  );
  const recorded = draft.sets.filter(
    (entry) => entry.status === "recorded",
  ).length;
  const resolved = draft.sets.filter(
    (entry) => entry.status !== "pending",
  ).length;
  const elapsed = elapsedDuration(draft, now);
  const run = async (
    type:
      | "pause"
      | "resume"
      | "next"
      | "pause-rest"
      | "resume-rest"
      | "skip-rest"
      | "extend-rest",
  ) => {
    await app.command({ type });
  };
  const closeOptions = () => {
    setOptions(false);
    setConfirm(null);
    setLocalError("");
  };
  const ask = (value: Confirmation) => {
    setLocalError("");
    setConfirm(value);
  };
  const validRest = (value: string) =>
    /^\d+$/.test(value.trim()) && Number(value) >= 0 && Number(value) <= 900;
  const confirmationTitle =
    confirm === "end"
      ? "End this workout?"
      : confirm === "skip"
        ? "Skip remaining exercise?"
        : confirm === "leave"
          ? "Pause and leave?"
          : "Discard this workout?";
  const endConfirm = async () => {
    setLocalError("");
    let succeeded = false;
    if (confirm === "end") {
      succeeded = await app.command({ type: "end" });
      if (succeeded) {
        app.acceptRecovery();
        router.push("/workout/summary");
      }
    } else if (confirm === "skip" && set) {
      succeeded = await app.command({ type: "skip-exercise", setId: set.id });
    } else if (confirm === "discard") {
      succeeded = await app.discard();
      if (succeeded) {
        app.acceptRecovery();
        router.push("/");
      }
    } else if (confirm === "leave") {
      try {
        await app.flushInput();
      } catch {
        closeOptions();
        return;
      }
      succeeded =
        draft.phase === "paused" || (await app.command({ type: "pause" }));
      if (succeeded) router.push("/");
    }
    // Close failures too so the global persistence error and Retry remain accessible.
    closeOptions();
  };

  return (
    <div className="workout-wrap">
      <div className="workout-top">
        <div>
          <p className="eyebrow">Guided session</p>
          <p className="small">{draft.snapshot.programName}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p className="small">Workout elapsed time</p>
          <span className="timer-small">{formatDuration(elapsed)}</span>
        </div>
      </div>
      {elapsed < 0 && (
        <div className="notice error" role="alert">
          <p>
            The device clock moved backward. Your recorded sets are safe.
            Correct the device clock before ending or resuming the workout;
            review also allows duration correction.
          </p>
        </div>
      )}
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Sets resolved"
        aria-valuemin={0}
        aria-valuenow={resolved}
        aria-valuemax={draft.sets.length}
      >
        <span style={{ width: `${(resolved / draft.sets.length) * 100}%` }} />
      </div>
      <div className="progress-caption">
        <span>
          {recorded} / {draft.sets.length} sets recorded
        </span>
        <span>{resolved} resolved, including skips</span>
      </div>

      {app.recovered ? (
        <section className="card exercise-focus">
          <span className="empty-icon" style={{ margin: "0 auto 20px" }}>
            <Icon name="history" size={28} />
          </span>
          <h1>Your progress is here.</h1>
          <p className="small">
            {recorded} sets recorded.{" "}
            {draft.phase === "paused"
              ? "This workout is paused."
              : "Unpaused time away is included in elapsed time. You can correct duration in review."}
          </p>
          <Button
            className="full"
            style={{ marginTop: 24 }}
            disabled={app.busy}
            onClick={async () => {
              if (
                draft.phase !== "paused" ||
                (await app.command({ type: "resume" }))
              )
                app.acceptRecovery();
            }}
          >
            Resume Workout
            <Icon name="play" size={16} />
          </Button>
          <div
            className="row"
            style={{ justifyContent: "center", marginTop: 12 }}
          >
            <Button
              variant="ghost"
              disabled={app.busy}
              onClick={() => ask("end")}
            >
              End and review
            </Button>
            <Button
              variant="ghost"
              disabled={app.busy}
              onClick={() => ask("discard")}
            >
              Discard
            </Button>
          </div>
        </section>
      ) : draft.phase === "paused" ? (
        <section className="card exercise-focus">
          <Badge tone="warning">Workout paused</Badge>
          <h1>Take your time.</h1>
          <p>
            Your session and rest timer are paused. Your recorded sets are
            saved.
          </p>
          <Button
            className="full"
            style={{ marginTop: 28 }}
            disabled={app.busy}
            onClick={() => void run("resume")}
          >
            Resume workout
            <Icon name="play" size={16} />
          </Button>
          <Button
            variant="ghost"
            disabled={app.busy}
            onClick={() => ask("leave")}
            style={{ marginTop: 12 }}
          >
            Leave workout
          </Button>
        </section>
      ) : draft.phase === "resting" ? (
        <section className="card exercise-focus">
          <Badge tone="mint">Recover & reset</Badge>
          <h1>A moment to recover.</h1>
          <div className="timer-orbit">
            <span
              className="countdown"
              aria-label={`${countdownSeconds(draft.rest, now)} seconds remaining`}
            >
              {formatDuration(countdownSeconds(draft.rest, now) * 1000)}
            </span>
          </div>
          <p className="small">
            {draft.rest?.status === "paused"
              ? "Rest timer paused"
              : "Let your breathing settle."}
          </p>
          <div
            className="row"
            style={{ justifyContent: "center", margin: "22px 0" }}
          >
            <Button
              variant="secondary"
              disabled={app.busy}
              onClick={() =>
                void run(
                  draft.rest?.status === "paused"
                    ? "resume-rest"
                    : "pause-rest",
                )
              }
            >
              {draft.rest?.status === "paused" ? "Resume rest" : "Pause rest"}
            </Button>
            <Button
              variant="secondary"
              disabled={app.busy || countdownSeconds(draft.rest, now) >= 900}
              onClick={() => void run("extend-rest")}
            >
              +30 seconds
            </Button>
          </div>
          <Button
            className="full"
            variant="secondary"
            disabled={app.busy}
            onClick={() => void run("skip-rest")}
          >
            Skip rest
            <Icon />
          </Button>
          <Button
            variant="ghost"
            disabled={app.busy}
            onClick={() => {
              setRestValue(
                String(Math.min(900, countdownSeconds(draft.rest, now))),
              );
              setLocalError("");
              setRestEdit(true);
            }}
          >
            Set remaining duration
          </Button>
          <hr />
          <p className="eyebrow">Up next</p>
          <h3>{exercise?.name}</h3>
          <p className="small">
            Set {set?.setNumber} of {exercise?.sets.length}
          </p>
          <p className="sr-only" aria-live="polite">
            {draft.rest?.status === "paused"
              ? "Rest paused"
              : "Rest in progress"}
          </p>
        </section>
      ) : draft.phase === "ready" ? (
        <section className="card exercise-focus">
          <Badge tone="mint">
            <Icon name="check" size={13} />
            Rest complete
          </Badge>
          <h1>You’re ready.</h1>
          <p>
            {exercise?.name} · Set {set?.setNumber} of {exercise?.sets.length}
          </p>
          <Button
            className="full"
            style={{ marginTop: 30 }}
            disabled={app.busy}
            onClick={() => void run("next")}
          >
            Start next set
            <Icon name="play" size={16} />
          </Button>
          <p className="sr-only" role="status">
            Rest complete. Start your next set when ready.
          </p>
        </section>
      ) : (
        <section className="card exercise-focus">
          <Badge tone="mint">
            Exercise {index + 1} of {draft.snapshot.exercises.length}
          </Badge>
          <h1>{exercise?.name}</h1>
          <p className="small">
            Set {set?.setNumber} of {exercise?.sets.length}{" "}
            <span style={{ margin: "0 8px", color: "#46566a" }}>·</span>
            <span className="mint-text">
              {set ? targetLabel(set.target) : ""}
            </span>
          </p>
          <div className="technique">
            <span
              className="eyebrow"
              style={{ display: "block", marginBottom: 7 }}
            >
              Technique cue
            </span>
            <p>{exercise?.instructions}</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (set)
                void app.command({
                  type: "confirm",
                  setId: set.id,
                  value: app.input,
                });
            }}
          >
            <label className="field">
              <span>Actual repetitions</span>
              <input
                className="rep-input"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="—"
                maxLength={8}
                value={app.input}
                disabled={app.busy}
                onChange={(event) => app.setInput(event.target.value)}
                onBlur={() => {
                  void app.flushInput().catch(() => {});
                }}
                aria-describedby="rep-hint"
              />
            </label>
            <p
              id="rep-hint"
              className="small"
              style={{ margin: "10px 0 22px" }}
            >
              Log what you did. Fewer reps are okay.
            </p>
            <Button type="submit" className="full" disabled={app.busy || !set}>
              Complete set
              <Icon name="check" size={18} />
            </Button>
          </form>
          <div className="set-pills">
            {draft.sets
              .filter((entry) => entry.exerciseEntryId === exercise?.id)
              .map((entry) => (
                <span
                  key={entry.id}
                  className={`set-pill ${entry.status === "recorded" ? "done" : ""} ${entry.id === set?.id ? "current" : ""}`}
                >
                  Set {entry.setNumber} ·{" "}
                  {entry.status === "recorded"
                    ? entry.actualReps
                    : entry.status === "skipped"
                      ? "skipped"
                      : "—"}
                </span>
              ))}
          </div>
        </section>
      )}

      <div className="workout-actions">
        <Button
          variant="ghost"
          disabled={app.busy || draft.phase === "paused" || app.recovered}
          onClick={() => void run("pause")}
        >
          <Icon name="pause" size={16} />
          Pause workout
        </Button>
        <Button
          variant="ghost"
          aria-label="Workout options"
          disabled={app.busy}
          onClick={() => {
            setLocalError("");
            setFutureRest(String(draft.restSeconds));
            setOptions(true);
          }}
        >
          <Icon name="more" />
          Options
        </Button>
      </div>
      <p className="small muted" style={{ textAlign: "center", fontSize: 11 }}>
        Timers recover when you return. Background alarms aren’t guaranteed.
      </p>

      {/* One modal owns both option and confirmation views; native dialogs never stack. */}
      <Dialog
        open={options || confirm !== null}
        title={confirm ? confirmationTitle : "Workout options"}
        onClose={closeOptions}
      >
        {confirm ? (
          <>
            <p>
              {confirm === "end"
                ? "Your recorded sets will be kept. Remaining sets will be marked not attempted, and you can review before saving."
                : confirm === "skip"
                  ? "Recorded sets stay intact. Only pending sets of this exercise will be skipped. You can correct results in review."
                  : confirm === "leave"
                    ? "Your progress will be saved and workout time will pause until you resume."
                    : "This removes the unfinished session. Saved workout history is unaffected."}
            </p>
            <div className="dialog-actions">
              <Button autoFocus variant="secondary" onClick={closeOptions}>
                Keep training
              </Button>
              <Button
                variant={confirm === "discard" ? "danger" : "primary"}
                disabled={app.busy}
                onClick={() => void endConfirm()}
              >
                {confirm === "end"
                  ? "End and review"
                  : confirm === "skip"
                    ? "Skip exercise"
                    : confirm === "leave"
                      ? "Pause and leave"
                      : "Discard workout"}
              </Button>
            </div>
          </>
        ) : (
          <div className="stack">
            {!app.recovered && draft.phase === "performing" && set && (
              <>
                <Button
                  variant="secondary"
                  disabled={app.busy}
                  onClick={async () => {
                    await app.command({ type: "skip-set", setId: set.id });
                    closeOptions();
                  }}
                >
                  Skip set
                </Button>
                <Button
                  variant="secondary"
                  disabled={app.busy}
                  onClick={() => ask("skip")}
                >
                  Skip remaining exercise
                </Button>
              </>
            )}
            <label className="field">
              <span>Future rests in this session (seconds)</span>
              <input
                type="text"
                inputMode="numeric"
                disabled={app.busy}
                value={futureRest}
                onChange={(event) => {
                  setFutureRest(event.target.value);
                  setLocalError("");
                }}
                aria-describedby={localError ? "option-rest-error" : undefined}
                aria-invalid={!!localError}
              />
            </label>
            {localError && (
              <div id="option-rest-error">
                <ErrorText>{localError}</ErrorText>
              </div>
            )}
            <Button
              variant="secondary"
              disabled={app.busy}
              onClick={async () => {
                if (!validRest(futureRest)) {
                  setLocalError("Enter whole seconds from 0 to 900.");
                  return;
                }
                await app.command({
                  type: "set-rest-default",
                  seconds: Number(futureRest),
                });
                closeOptions();
              }}
            >
              Update future rests
            </Button>
            <Button
              variant="secondary"
              disabled={app.busy}
              onClick={() => ask("leave")}
            >
              Pause and leave
            </Button>
            <Button
              variant="danger"
              disabled={app.busy}
              onClick={() => ask("end")}
            >
              End workout
            </Button>
            <Button
              variant="ghost"
              disabled={app.busy}
              onClick={() => ask("discard")}
            >
              Discard unfinished workout
            </Button>
          </div>
        )}
      </Dialog>
      <Dialog
        open={restEdit}
        title="Set remaining rest"
        onClose={() => {
          setRestEdit(false);
          setLocalError("");
        }}
      >
        <label className="field">
          <span>Remaining seconds (0–900)</span>
          <input
            type="text"
            inputMode="numeric"
            disabled={app.busy}
            value={restValue}
            onChange={(event) => {
              setRestValue(event.target.value);
              setLocalError("");
            }}
            aria-describedby={localError ? "current-rest-error" : undefined}
            aria-invalid={!!localError}
          />
        </label>
        {localError && (
          <div id="current-rest-error">
            <ErrorText>{localError}</ErrorText>
          </div>
        )}
        <div className="dialog-actions">
          <Button
            disabled={app.busy}
            onClick={async () => {
              if (!validRest(restValue)) {
                setLocalError("Enter whole seconds from 0 to 900.");
                return;
              }
              await app.command({
                type: "set-rest",
                seconds: Number(restValue),
              });
              setRestEdit(false);
              setLocalError("");
            }}
          >
            Set rest
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
