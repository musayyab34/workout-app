import type { Draft, Program, Session, SetRecord } from "@/domain/schemas";
import { assertDraft, assertSession, outcomeFor } from "@/domain/invariants";
import { dateKey } from "@/lib/time";
import { elapsedDuration, remainingRest } from "./timer";

export type WorkoutCommand =
  | { type: "input"; setId: string; value: string }
  | { type: "confirm"; setId: string; value: string }
  | { type: "skip-set" | "skip-exercise"; setId: string }
  | {
      type:
        | "next"
        | "pause"
        | "resume"
        | "pause-rest"
        | "resume-rest"
        | "skip-rest"
        | "extend-rest"
        | "tick"
        | "end";
    }
  | { type: "set-rest" | "set-rest-default"; seconds: number };

function demand(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function iso(now: number): string {
  return new Date(now).toISOString();
}
function validSeconds(seconds: number): void {
  demand(
    Number.isInteger(seconds) && seconds >= 0 && seconds <= 900,
    "Rest must be a whole number from 0 to 900 seconds.",
  );
}
export function parseReps(input: string): number {
  const value = input.trim();
  demand(/^\d+$/.test(value), "Enter whole repetitions from 0 to 10,000.");
  const reps = Number(value);
  demand(
    Number.isInteger(reps) && reps >= 0 && reps <= 10000,
    "Enter whole repetitions from 0 to 10,000.",
  );
  return reps;
}
export function currentSet(draft: Draft): SetRecord | undefined {
  return draft.sets.find((set) => set.id === draft.currentSetId);
}
export function createDraft(
  program: Program,
  restSeconds: number,
  now = Date.now(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): Draft {
  demand(
    program.availability === "active" && program.templates.length,
    "This program is not available yet.",
  );
  validSeconds(restSeconds);
  const template = program.templates[0];
  const time = iso(now);
  const snapshot = {
    programId: program.id,
    programName: program.name,
    programVersion: program.version,
    templateId: template.id,
    templateVersion: template.version,
    exercises: structuredClone(template.exercises),
  };
  const sets: SetRecord[] = snapshot.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      id: crypto.randomUUID(),
      templateSetId: set.id,
      exerciseEntryId: exercise.id,
      exerciseId: exercise.exerciseId,
      setNumber: set.setNumber,
      target: structuredClone(set.target),
      status: "pending",
      actualReps: null,
      recordedAt: null,
      activityDate: null,
      origin: "live",
      correctedAt: null,
      skipNote: null,
    })),
  );
  const draft: Draft = {
    id: crypto.randomUUID(),
    revision: 0,
    snapshot,
    sets,
    startedAt: time,
    startLocalDate: dateKey(now, timeZone),
    timeZone,
    correctedDurationMs: null,
    durationNote: null,
    createdAt: time,
    updatedAt: time,
    phase: "performing",
    currentSetId: sets[0].id,
    input: "",
    restSeconds,
    rest: null,
    pause: null,
    accumulatedPausedMs: 0,
    endedAt: null,
    endLocalDate: null,
    endReason: null,
  };
  assertDraft(draft);
  return draft;
}
function finish(draft: Draft, now: number, reason: Draft["endReason"]): void {
  const elapsed = elapsedDuration(draft, now);
  demand(
    elapsed >= 0,
    "The device clock changed. Correct the clock before ending this workout; your recorded results are safe.",
  );
  if (draft.pause)
    draft.accumulatedPausedMs += Math.max(
      0,
      now - Date.parse(draft.pause.startedAt),
    );
  draft.pause = null;
  draft.rest = null;
  draft.currentSetId = null;
  draft.phase = "review";
  draft.input = "";
  draft.endedAt = iso(now);
  draft.endLocalDate = dateKey(now, draft.timeZone);
  draft.endReason = reason;
}
function advance(
  draft: Draft,
  now: number,
  withRest: boolean,
  sourceSetId: string,
): void {
  const next = draft.sets.find((set) => set.status === "pending");
  draft.input = "";
  draft.rest = null;
  if (!next) {
    finish(draft, now, "routine-finished");
    return;
  }
  draft.currentSetId = next.id;
  if (!withRest) {
    draft.phase = "performing";
    return;
  }
  if (draft.restSeconds === 0) {
    draft.phase = "ready";
    return;
  }
  draft.phase = "resting";
  draft.rest = {
    id: crypto.randomUUID(),
    sourceSetId,
    nextSetId: next.id,
    durationMs: draft.restSeconds * 1000,
    deadlineAt: now + draft.restSeconds * 1000,
    remainingMs: draft.restSeconds * 1000,
    status: "running",
    startedAt: iso(now),
  };
}
function ready(draft: Draft): void {
  draft.phase = "ready";
  if (draft.rest) {
    draft.rest.status = "ready";
    draft.rest.deadlineAt = null;
    draft.rest.remainingMs = 0;
  }
}

export function transition(
  original: Draft,
  command: WorkoutCommand,
  now = Date.now(),
): Draft {
  assertDraft(original);
  if (
    command.type === "tick" &&
    (original.phase !== "resting" ||
      original.rest?.status !== "running" ||
      remainingRest(original.rest, now) > 0)
  )
    return original;
  const draft = structuredClone(original);
  switch (command.type) {
    case "input":
      demand(
        draft.phase === "performing" && draft.currentSetId === command.setId,
        "The current set changed. Reopen it before recording.",
      );
      demand(command.value.length <= 100, "Repetition input is too long.");
      draft.input = command.value;
      break;
    case "confirm": {
      demand(
        draft.phase === "performing" && draft.currentSetId === command.setId,
        "This set has already changed. Refresh your workout.",
      );
      const set = currentSet(draft)!;
      demand(set.status === "pending", "This set is already resolved.");
      set.actualReps = parseReps(command.value);
      set.status = "recorded";
      set.recordedAt = iso(now);
      set.activityDate = dateKey(now, draft.timeZone);
      advance(draft, now, true, set.id);
      break;
    }
    case "skip-set":
    case "skip-exercise": {
      demand(
        draft.phase === "performing" && draft.currentSetId === command.setId,
        "The current set changed.",
      );
      const set = currentSet(draft)!;
      draft.sets.forEach((candidate) => {
        if (
          candidate.status === "pending" &&
          (candidate.id === set.id ||
            (command.type === "skip-exercise" &&
              candidate.exerciseEntryId === set.exerciseEntryId))
        )
          candidate.status = "skipped";
      });
      advance(draft, now, false, set.id);
      break;
    }
    case "next":
      demand(draft.phase === "ready", "Finish or skip rest first.");
      draft.phase = "performing";
      draft.rest = null;
      break;
    case "pause-rest":
      demand(
        draft.phase === "resting" && draft.rest?.status === "running",
        "There is no running rest to pause.",
      );
      draft.rest.remainingMs = remainingRest(draft.rest, now);
      draft.rest.deadlineAt = null;
      draft.rest.status = "paused";
      if (!draft.rest.remainingMs) ready(draft);
      break;
    case "resume-rest":
      demand(
        draft.phase === "resting" && draft.rest?.status === "paused",
        "There is no paused rest to resume.",
      );
      draft.rest.deadlineAt = now + draft.rest.remainingMs;
      draft.rest.status = "running";
      break;
    case "extend-rest":
    case "set-rest": {
      demand(
        draft.phase === "resting" && draft.rest,
        "There is no rest to adjust.",
      );
      if (command.type === "set-rest") validSeconds(command.seconds);
      const remaining =
        "seconds" in command
          ? command.seconds * 1000
          : Math.min(900000, remainingRest(draft.rest, now) + 30000);
      draft.rest.remainingMs = remaining;
      if (!remaining) ready(draft);
      else if (draft.rest.status === "running")
        draft.rest.deadlineAt = now + remaining;
      break;
    }
    case "skip-rest":
      demand(draft.phase === "resting", "There is no rest to skip.");
      ready(draft);
      break;
    case "tick":
      ready(draft);
      break;
    case "pause": {
      demand(
        draft.phase !== "paused" && draft.phase !== "review",
        "This workout is not running.",
      );
      // Reconcile before freezing so an expired rest never resumes as a fresh countdown.
      if (
        draft.phase === "resting" &&
        draft.rest?.status === "running" &&
        remainingRest(draft.rest, now) === 0
      )
        ready(draft);
      const previousPhase = draft.phase as "performing" | "resting" | "ready";
      const restWasRunning = draft.rest?.status === "running";
      if (restWasRunning && draft.rest) {
        draft.rest.remainingMs = remainingRest(draft.rest, now);
        draft.rest.deadlineAt = null;
        draft.rest.status = "paused";
      }
      draft.pause = { startedAt: iso(now), previousPhase, restWasRunning };
      draft.phase = "paused";
      break;
    }
    case "resume": {
      demand(
        draft.phase === "paused" && draft.pause,
        "This workout is not paused.",
      );
      const pause = draft.pause;
      demand(
        now >= Date.parse(pause.startedAt),
        "The device clock moved backward. Correct it before resuming.",
      );
      draft.accumulatedPausedMs += now - Date.parse(pause.startedAt);
      draft.phase = pause.previousPhase;
      if (pause.restWasRunning && draft.rest) {
        draft.rest.status = "running";
        draft.rest.deadlineAt = now + draft.rest.remainingMs;
      }
      draft.pause = null;
      break;
    }
    case "set-rest-default":
      validSeconds(command.seconds);
      demand(draft.phase !== "review", "Workout has ended.");
      draft.restSeconds = command.seconds;
      break;
    case "end":
      demand(draft.phase !== "review", "This workout has already ended.");
      draft.sets.forEach((set) => {
        if (set.status === "pending") set.status = "not-attempted";
      });
      finish(draft, now, "ended-early");
      break;
  }
  draft.revision += 1;
  draft.updatedAt = iso(now);
  assertDraft(draft);
  return draft;
}

export function finalizeDraft(draft: Draft): Session {
  assertDraft(draft);
  demand(
    draft.phase === "review" &&
      draft.endedAt &&
      draft.endLocalDate &&
      draft.endReason,
    "End the workout and review it before saving.",
  );
  const {
    phase: _phase,
    currentSetId: _current,
    input: _input,
    restSeconds: _restSeconds,
    rest: _rest,
    pause: _pause,
    accumulatedPausedMs: _paused,
    ...fields
  } = draft;
  void _phase;
  void _current;
  void _input;
  void _restSeconds;
  void _rest;
  void _pause;
  void _paused;
  const calculatedDurationMs = elapsedDuration(
    draft,
    Date.parse(draft.endedAt),
  );
  demand(
    calculatedDurationMs >= 0,
    "Calculated duration is invalid; check the device clock.",
  );
  const session: Session = {
    ...fields,
    endedAt: draft.endedAt,
    endLocalDate: draft.endLocalDate,
    endReason: draft.endReason,
    outcome: outcomeFor(draft.sets),
    calculatedDurationMs,
  };
  assertSession(session);
  return session;
}

export function correctSet<T extends Draft | Session>(
  original: T,
  setId: string,
  status: "recorded" | "skipped" | "not-attempted",
  reps: number | null,
  activityDate: string | undefined,
  now = Date.now(),
): T {
  demand(
    !("phase" in original) || original.phase === "review",
    "Correct results in workout review.",
  );
  const record = structuredClone(original);
  const set = record.sets.find((candidate) => candidate.id === setId);
  demand(set, "Set not found.");
  if (status === "recorded") {
    demand(
      reps !== null && Number.isInteger(reps) && reps >= 0 && reps <= 10000,
      "Enter whole repetitions from 0 to 10,000.",
    );
    set.actualReps = reps;
    set.activityDate =
      activityDate ?? set.activityDate ?? record.startLocalDate;
    if (set.status !== "recorded" && !set.recordedAt)
      set.origin = "manual-correction";
  } else {
    set.actualReps = null;
    set.activityDate = null;
  }
  set.status = status;
  set.correctedAt = iso(now);
  record.updatedAt = iso(now);
  record.revision += 1;
  if ("outcome" in record) {
    record.outcome = outcomeFor(record.sets);
    assertSession(record);
  } else assertDraft(record);
  return record;
}
export function correctDuration<T extends Draft | Session>(
  original: T,
  durationMs: number | null,
  note: string | null,
  now = Date.now(),
): T {
  demand(
    !("phase" in original) || original.phase === "review",
    "Correct duration in workout review.",
  );
  demand(
    durationMs === null ||
      (Number.isSafeInteger(durationMs) && durationMs >= 0),
    "Duration must be nonnegative whole milliseconds.",
  );
  const record = structuredClone(original);
  record.correctedDurationMs = durationMs;
  record.durationNote = note;
  record.updatedAt = iso(now);
  record.revision += 1;
  if ("outcome" in record) assertSession(record);
  else assertDraft(record);
  return record;
}
export function freezeDraftAt(draft: Draft, exportedAt: number): Draft {
  assertDraft(draft);
  demand(
    exportedAt >= Date.parse(draft.updatedAt),
    "Backup timestamp precedes the unfinished workout update.",
  );
  if (draft.phase === "review" || draft.phase === "paused")
    return structuredClone(draft);
  return transition(draft, { type: "pause" }, exportedAt);
}
