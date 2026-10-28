import { describe, expect, it } from "vitest";
import { conditioningProgram, programs } from "@/programs/catalog";
import { assertDataset, assertDraft, assertSession } from "@/domain/invariants";
import { dateKeySchema, emptyDataset } from "@/domain/schemas";
import {
  createDraft,
  correctDuration,
  correctSet,
  currentSet,
  finalizeDraft,
  freezeDraftAt,
  parseReps,
  transition,
} from "@/features/workout/machine";
import { elapsedDuration, remainingRest } from "@/features/workout/timer";
import { addDays, dateKey, weekStart } from "@/lib/time";

const start = Date.parse("2026-10-29T12:00:00.000Z");
const draft = (rest = 90) =>
  createDraft(conditioningProgram, rest, start, "Asia/Shanghai");
describe("prescription and validation", () => {
  it("preserves six exercises and eighteen sets with only 240 fixed-target repetitions", () => {
    const workout = draft();
    expect(workout.snapshot.exercises.map((e) => e.name)).toEqual([
      "Pogo Jumps",
      "Calf Raises",
      "Bodyweight Squats",
      "Sit-Ups",
      "Push-Ups",
      "Tibialis Anterior Raises",
    ]);
    expect(workout.sets).toHaveLength(18);
    expect(
      workout.sets.reduce(
        (sum, set) => sum + (set.target.type === "fixed" ? set.target.reps : 0),
        0,
      ),
    ).toBe(240);
    expect(programs.filter((p) => p.availability === "active")).toHaveLength(1);
    expect(() => createDraft(programs[1], 90, start, "UTC")).toThrow(
      /not available/,
    );
  });
  it.each(["", " ", "-1", "1.5", "1e2", "+2", "10,000", "10001", "Infinity"])(
    "rejects invalid actual entry %s",
    (input) => expect(() => parseReps(input)).toThrow(),
  );
  it("accepts explicit zero and trims/normalizes leading zeros", () => {
    expect(parseReps("0")).toBe(0);
    expect(parseReps(" 0013 ")).toBe(13);
  });
  it("rejects impossible calendar dates", () => {
    expect(dateKeySchema.safeParse("2025-02-29").success).toBe(false);
    expect(dateKeySchema.safeParse("2024-02-29").success).toBe(true);
  });
  it("does not mutate snapshot targets when catalog values change", () => {
    const program = structuredClone(conditioningProgram);
    const workout = createDraft(program, 90, start, "UTC");
    program.templates[0].exercises[0].sets[0].target = {
      type: "fixed",
      reps: 99,
    };
    expect(workout.sets[0].target).toEqual({ type: "fixed", reps: 20 });
  });
});

describe("workout transitions", () => {
  it("records 13 separately from the 20-repetition target and starts one rest", () => {
    const initial = draft();
    const result = transition(
      initial,
      { type: "confirm", setId: initial.currentSetId!, value: "13" },
      start + 1000,
    );
    expect(result.sets[0]).toMatchObject({
      actualReps: 13,
      target: { type: "fixed", reps: 20 },
      status: "recorded",
    });
    expect(result.phase).toBe("resting");
    expect(remainingRest(result.rest, start + 1000)).toBe(90000);
    expect(initial.sets[0].status).toBe("pending");
    expect(() =>
      transition(
        result,
        { type: "confirm", setId: initial.currentSetId!, value: "13" },
        start + 1100,
      ),
    ).toThrow();
    expect(() =>
      transition(
        result,
        { type: "input", setId: initial.currentSetId!, value: "1" },
        start + 1100,
      ),
    ).toThrow();
  });
  it("skips without fabricating zero or adding rest", () => {
    let workout = draft();
    workout = transition(
      workout,
      { type: "skip-set", setId: workout.currentSetId! },
      start + 1,
    );
    expect(workout.sets[0]).toMatchObject({
      status: "skipped",
      actualReps: null,
    });
    expect(workout.phase).toBe("performing");
    workout = transition(
      workout,
      { type: "skip-exercise", setId: workout.currentSetId! },
      start + 2,
    );
    expect(
      workout.sets.slice(0, 3).every((set) => set.status === "skipped"),
    ).toBe(true);
    expect(currentSet(workout)?.exerciseId).toBe("calf-raises");
  });
  it("completes all eighteen sets, including qualitative targets and zero, without final rest", () => {
    let workout = draft(0);
    for (let index = 0; index < 18; index++) {
      if (workout.phase === "ready")
        workout = transition(workout, { type: "next" }, start + index * 1000);
      workout = transition(
        workout,
        {
          type: "confirm",
          setId: workout.currentSetId!,
          value: index === 17 ? "0" : "13",
        },
        start + index * 1000 + 500,
      );
    }
    expect(workout.phase).toBe("review");
    expect(workout.rest).toBeNull();
    const saved = finalizeDraft(workout);
    expect(saved.outcome).toBe("completed");
    expect(saved.sets[17].actualReps).toBe(0);
    assertSession(saved);
  });
  it("ends early with not-attempted values and correctable mistakes", () => {
    let workout = transition(draft(), { type: "end" }, start + 30000);
    expect(workout.sets.every((set) => set.status === "not-attempted")).toBe(
      true,
    );
    workout = correctSet(
      workout,
      workout.sets[0].id,
      "recorded",
      8,
      undefined,
      start + 40000,
    );
    expect(workout.sets[0]).toMatchObject({
      actualReps: 8,
      recordedAt: null,
      origin: "manual-correction",
      activityDate: "2026-10-29",
    });
    const saved = finalizeDraft(workout);
    expect(saved.outcome).toBe("partial");
    expect(saved.calculatedDurationMs).toBe(30000);
    expect(
      correctDuration(saved, 20000, "Removed interruption", start + 50000),
    ).toMatchObject({
      calculatedDurationMs: 30000,
      correctedDurationMs: 20000,
    });
  });
  it("rejects tampered targets, status/value mismatches, and duplicate records", () => {
    const workout = draft();
    workout.sets[0].actualReps = 13;
    expect(() => assertDraft(workout)).toThrow();
    workout.sets[0].actualReps = null;
    workout.sets[0].target = { type: "fixed", reps: 99 };
    expect(() => assertDraft(workout)).toThrow(/targets/);
    const saved = finalizeDraft(
      transition(draft(), { type: "end" }, start + 1),
    );
    const data = emptyDataset();
    data.sessions = [saved, saved];
    expect(() => assertDataset(data)).toThrow(/Duplicate/);
  });
});

describe("timers, pause and backup restoration", () => {
  const resting = () => {
    const d = draft();
    return transition(
      d,
      { type: "confirm", setId: d.currentSetId!, value: "10" },
      start,
    );
  };
  it("pauses rest at 70 seconds while overall elapsed time continues", () => {
    let workout = transition(resting(), { type: "pause-rest" }, start + 20000);
    expect(remainingRest(workout.rest, start + 60000)).toBe(70000);
    expect(elapsedDuration(workout, start + 60000)).toBe(60000);
    workout = transition(workout, { type: "resume-rest" }, start + 60000);
    expect(remainingRest(workout.rest, start + 70000)).toBe(60000);
  });
  it("preserves independent rest pause across whole-workout pause", () => {
    let workout = transition(resting(), { type: "pause-rest" }, start + 20000);
    workout = transition(workout, { type: "pause" }, start + 30000);
    expect(elapsedDuration(workout, start + 90000)).toBe(30000);
    workout = transition(workout, { type: "resume" }, start + 90000);
    expect(workout.rest?.status).toBe("paused");
    expect(remainingRest(workout.rest, start + 95000)).toBe(70000);
    expect(elapsedDuration(workout, start + 95000)).toBe(35000);
  });
  it("reconciles hidden expiry once and requires next-set action", () => {
    let workout = transition(resting(), { type: "tick" }, start + 120000);
    expect(workout.phase).toBe("ready");
    expect(
      workout.sets.filter((set) => set.status === "recorded"),
    ).toHaveLength(1);
    const unchanged = transition(workout, { type: "tick" }, start + 130000);
    expect(unchanged).toBe(workout);
    workout = transition(workout, { type: "next" }, start + 130000);
    expect(workout.phase).toBe("performing");
  });
  it("extends paused and running countdowns with a 900-second ceiling", () => {
    let workout = transition(
      resting(),
      { type: "set-rest", seconds: 890 },
      start + 1000,
    );
    workout = transition(workout, { type: "extend-rest" }, start + 1000);
    expect(remainingRest(workout.rest, start + 1000)).toBe(900000);
    workout = transition(workout, { type: "pause-rest" }, start + 11000);
    workout = transition(workout, { type: "extend-rest" }, start + 11000);
    expect(remainingRest(workout.rest, start + 90000)).toBe(900000);
    workout = transition(
      workout,
      { type: "set-rest", seconds: 0 },
      start + 12000,
    );
    expect(workout.phase).toBe("ready");
  });
  it("freezes imported running drafts at export, excluding days until resume", () => {
    const frozen = freezeDraftAt(resting(), start + 20000);
    expect(frozen.phase).toBe("paused");
    expect(frozen.rest?.remainingMs).toBe(70000);
    const resumed = transition(frozen, { type: "resume" }, start + 86400000);
    expect(remainingRest(resumed.rest, start + 86400000)).toBe(70000);
    expect(elapsedDuration(resumed, start + 86400000)).toBe(20000);
  });
  it("normalizes expired imports, preserves existing pauses, and excludes review time", () => {
    const expired = freezeDraftAt(resting(), start + 120000);
    expect(expired.pause?.previousPhase).toBe("ready");
    const paused = transition(resting(), { type: "pause" }, start + 10000);
    expect(freezeDraftAt(paused, start + 100000)).toEqual(paused);
    const review = transition(paused, { type: "end" }, start + 90000);
    expect(elapsedDuration(review, start + 86400000)).toBe(10000);
    expect(finalizeDraft(review).calculatedDurationMs).toBe(10000);
  });
});

describe("calendar helpers", () => {
  it("uses calendar arithmetic across leap days and weeks", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(weekStart("2027-01-03")).toBe("2026-12-28");
  });
  it("captures a local day independently of UTC", () =>
    expect(dateKey("2026-10-29T20:00:00Z", "Asia/Shanghai")).toBe(
      "2026-10-30",
    ));
});
