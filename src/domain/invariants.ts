import {
  datasetSchema,
  draftSchema,
  sessionSchema,
  type Dataset,
  type Draft,
  type Session,
  type SetRecord,
} from "./schemas";

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function unique(values: string[], name: string): void {
  requireValue(new Set(values).size === values.length, `Duplicate ${name}`);
}
export function outcomeFor(sets: SetRecord[]): "completed" | "partial" {
  return sets.every((set) => set.status === "recorded")
    ? "completed"
    : "partial";
}

function assertRecords(record: Draft | Session): void {
  unique(
    record.snapshot.exercises.map((e) => e.id),
    "exercise entry IDs",
  );
  const prescriptions = record.snapshot.exercises.flatMap((exercise) =>
    exercise.sets.map((set, index) => {
      requireValue(
        set.setNumber === index + 1,
        "Prescription set numbers must be sequential",
      );
      return { exercise, set };
    }),
  );
  unique(
    prescriptions.map(({ set }) => set.id),
    "prescription IDs",
  );
  unique(
    record.sets.map((set) => set.id),
    "set IDs",
  );
  requireValue(
    record.sets.length === prescriptions.length,
    "Set count does not match the prescription snapshot",
  );
  record.sets.forEach((set, index) => {
    const expected = prescriptions[index];
    requireValue(
      set.templateSetId === expected.set.id &&
        set.exerciseEntryId === expected.exercise.id &&
        set.exerciseId === expected.exercise.exerciseId &&
        set.setNumber === expected.set.setNumber,
      "Set order or references do not match the prescription",
    );
    const targetMatches =
      set.target.type === expected.set.target.type &&
      (set.target.type === "fixed" && expected.set.target.type === "fixed"
        ? set.target.reps === expected.set.target.reps
        : set.target.type !== "fixed" &&
          expected.set.target.type !== "fixed" &&
          set.target.instruction === expected.set.target.instruction);
    requireValue(
      targetMatches,
      "Recorded targets differ from the prescription snapshot",
    );
    requireValue(
      set.status === "recorded"
        ? set.actualReps !== null && set.activityDate !== null
        : set.actualReps === null && set.activityDate === null,
      "Set status and actual repetitions are inconsistent",
    );
    if (set.status === "recorded") {
      requireValue(
        set.activityDate! >= record.startLocalDate &&
          (!record.endedAt || set.activityDate! <= record.endLocalDate!),
        "Activity date falls outside the session dates",
      );
      requireValue(
        set.origin === "manual-correction" || set.recordedAt !== null,
        "Live result has no observed recording timestamp",
      );
    }
    if (set.recordedAt) {
      requireValue(
        Date.parse(set.recordedAt) >= Date.parse(record.startedAt),
        "Set recording precedes workout start",
      );
      requireValue(
        !record.endedAt ||
          Date.parse(set.recordedAt) <= Date.parse(record.endedAt),
        "Set recording follows workout end",
      );
    }
  });
  requireValue(
    Date.parse(record.createdAt) <= Date.parse(record.updatedAt),
    "Record update precedes creation",
  );
  if (record.endedAt) {
    requireValue(
      Date.parse(record.endedAt) >= Date.parse(record.startedAt),
      "Workout end precedes start; correct the device clock",
    );
    requireValue(
      record.endLocalDate! >= record.startLocalDate,
      "Workout local end date precedes start date",
    );
  }
}
function assertDraftSemantics(draft: Draft): void {
  assertRecords(draft);
  const first = draft.sets.find((set) => set.status === "pending");
  if (draft.phase === "review") {
    requireValue(
      !first &&
        draft.currentSetId === null &&
        draft.endedAt &&
        draft.endLocalDate &&
        draft.endReason &&
        !draft.rest &&
        !draft.pause,
      "Review draft is incomplete",
    );
  } else {
    requireValue(
      first &&
        draft.currentSetId === first.id &&
        !draft.endedAt &&
        !draft.endLocalDate &&
        !draft.endReason,
      "Active draft pointer or end state is inconsistent",
    );
    requireValue(
      !draft.sets.some((set) => set.status === "not-attempted"),
      "Active draft contains an unattempted final result",
    );
    const firstPendingIndex = draft.sets.findIndex(
      (set) => set.status === "pending",
    );
    requireValue(
      draft.sets
        .slice(firstPendingIndex)
        .every((set) => set.status === "pending"),
      "Active draft has recorded sets after a pending set",
    );
  }
  requireValue(
    (draft.phase === "paused") === (draft.pause !== null),
    "Workout pause state does not match phase",
  );
  const effectivePhase = draft.pause?.previousPhase ?? draft.phase;
  if (effectivePhase === "resting")
    requireValue(
      draft.rest !== null && draft.rest.status !== "ready",
      "Resting phase requires an active rest",
    );
  if (effectivePhase === "performing")
    requireValue(draft.rest === null, "Set entry cannot contain a rest timer");
  if (effectivePhase === "ready")
    requireValue(
      draft.rest === null || draft.rest.status === "ready",
      "Next-set-ready phase contains an active timer",
    );
  if (effectivePhase !== "performing")
    requireValue(
      draft.input === "",
      "Rest or ready phase contains obsolete set input",
    );
  if (draft.rest) {
    requireValue(
      draft.rest.nextSetId === draft.currentSetId,
      "Rest points at the wrong next set",
    );
    requireValue(
      draft.sets.some(
        (set) =>
          set.id === draft.rest!.sourceSetId && set.status === "recorded",
      ),
      "Rest source is not a recorded set",
    );
    requireValue(
      draft.rest.status === "running"
        ? draft.rest.deadlineAt !== null
        : draft.rest.deadlineAt === null,
      "Rest deadline is inconsistent",
    );
    if (draft.rest.deadlineAt !== null)
      requireValue(
        draft.rest.deadlineAt >= Date.parse(draft.rest.startedAt),
        "Rest deadline precedes its start",
      );
    requireValue(
      draft.phase !== "paused" || draft.rest.status !== "running",
      "Whole-workout pause must freeze rest",
    );
  }
  if (draft.pause)
    requireValue(
      Date.parse(draft.pause.startedAt) >= Date.parse(draft.startedAt),
      "Pause precedes workout start",
    );
}
function assertSessionSemantics(session: Session): void {
  assertRecords(session);
  requireValue(
    !session.sets.some((set) => set.status === "pending"),
    "Saved session contains pending sets",
  );
  requireValue(
    session.outcome === outcomeFor(session.sets),
    "Saved outcome is inconsistent with set records",
  );
  requireValue(
    session.calculatedDurationMs <=
      Date.parse(session.endedAt) - Date.parse(session.startedAt),
    "Calculated duration exceeds wall-clock duration",
  );
}
function assertDatasetSemantics(data: Dataset): void {
  unique(
    data.sessions.map((session) => session.id),
    "session IDs",
  );
  unique(
    [
      ...data.sessions.flatMap((session) => session.sets.map((set) => set.id)),
      ...(data.draft?.sets.map((set) => set.id) ?? []),
    ],
    "set instance IDs across workouts",
  );
  data.sessions.forEach(assertSessionSemantics);
  if (data.draft) {
    requireValue(
      !data.sessions.some((session) => session.id === data.draft!.id),
      "Draft session already exists in history",
    );
    assertDraftSemantics(data.draft);
  }
}
export function assertDraft(draft: Draft): void {
  draftSchema.parse(draft);
  assertDraftSemantics(draft);
}
export function assertSession(session: Session): void {
  sessionSchema.parse(session);
  assertSessionSemantics(session);
}
export function assertDataset(data: Dataset): void {
  datasetSchema.parse(data);
  assertDatasetSemantics(data);
}
export function validateDataset(value: unknown): Dataset {
  const data = datasetSchema.parse(value);
  assertDatasetSemantics(data);
  return data;
}
