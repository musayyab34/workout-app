import { describe, expect, it } from "vitest";
import type { Session, SetRecord } from "../../src/domain/schemas";
import {
  calendarActivity,
  exerciseProgress,
  exerciseRecords,
  listExercises,
  listPrograms,
  monthlyConsistency,
  recoveryActivity,
  summarize,
  targetAttainment,
  weeklyConsistency,
} from "../../src/features/statistics";

function session(
  id: string,
  date: string,
  reps: (number | null)[],
  exerciseId = "squats",
): Session {
  const startedAt = `${date}T09:00:00.000Z`;
  const sets: SetRecord[] = reps.map((actualReps, i) => ({
    id: `${id}-set-${i}`,
    templateSetId: `set-${i}`,
    exerciseEntryId: "entry",
    exerciseId,
    setNumber: i + 1,
    target: { type: "fixed", reps: 20 },
    status: actualReps === null ? "skipped" : "recorded",
    actualReps,
    recordedAt: actualReps === null ? null : startedAt,
    activityDate: actualReps === null ? null : date,
    origin: "live",
    correctedAt: null,
    skipNote: null,
  }));
  return {
    id,
    revision: 1,
    snapshot: {
      programId: "conditioning",
      programName: "Conditioning",
      programVersion: 1,
      templateId: "routine",
      templateVersion: 1,
      exercises: [
        {
          id: "entry",
          exerciseId,
          name: exerciseId,
          instructions: "Control each repetition.",
          sets: sets.map((set) => ({
            id: set.templateSetId,
            setNumber: set.setNumber,
            recordingKind: "repetitions",
            target: set.target,
          })),
        },
      ],
    },
    sets,
    startedAt,
    startLocalDate: date,
    timeZone: "UTC",
    endedAt: `${date}T09:30:00.000Z`,
    endLocalDate: date,
    endReason: "routine-finished",
    outcome: reps.every((value) => value !== null) ? "completed" : "partial",
    calculatedDurationMs: 1800000,
    correctedDurationMs: null,
    durationNote: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };
}

describe("target attainment", () => {
  it("uses prescribed counts and caps credit separately per set", () => {
    expect(
      targetAttainment(session("a", "2026-10-26", [13, 15, 20]).sets),
    ).toEqual({ actual: 48, credited: 48, prescribed: 60, percent: 80 });
    const over = targetAttainment(
      session("b", "2026-10-26", [25, 15, 20]).sets,
    );
    expect(over.actual).toBe(60);
    expect(over.credited).toBe(55);
    expect(over.percent).toBeCloseTo(91.6667, 3);
  });

  it("keeps skipped targets in denominator and excludes qualitative targets", () => {
    const sets = session("a", "2026-10-26", [20, null, 10]).sets;
    expect(targetAttainment(sets).percent).toBe(50);
    sets[0].target = {
      type: "submaximal",
      instruction: "Stop before failure.",
    };
    sets[1].target = { type: "burning", instruction: "Stop before pain." };
    expect(targetAttainment(sets)).toEqual({
      actual: 10,
      credited: 10,
      prescribed: 20,
      percent: 50,
    });
    sets[2].target = {
      type: "submaximal",
      instruction: "Stop before failure.",
    };
    expect(targetAttainment(sets).percent).toBeNull();
  });
});

describe("workout consistency and volume", () => {
  it("separates completed/partial, includes partial reps, and uses corrected duration", () => {
    const a = session("a", "2026-10-26", [20, 20, 20]);
    a.correctedDurationMs = 1200000;
    const b = session("b", "2026-10-27", [10, null, 0]);
    const c = session("c", "2026-10-25", [0, 0, 0]);
    const result = summarize([a, b, c], { today: "2026-10-29" });
    expect(result.completed).toBe(2);
    expect(result.partial).toBe(1);
    expect(result.thisWeek).toBe(1);
    expect(result.totalReps).toBe(70);
    expect(result.trainingDays).toBe(2);
    expect(result.avgDurationMs).toBe(1500000);
  });

  it("groups Monday–Sunday correctly and scopes historical programs", () => {
    const a = session("a", "2026-12-27", [1, 2, 3]);
    const b = session("b", "2026-12-28", [1, 2, 3]);
    const c = session("c", "2027-01-01", [1, null, 3]);
    c.snapshot.programId = "archived";
    c.snapshot.programName = "Archived Program";
    const bars = weeklyConsistency([a, b, c], {
      today: "2027-01-01",
      weeks: 2,
    });
    expect(
      bars.map((bar) => [bar.startDate, bar.completed, bar.partial]),
    ).toEqual([
      ["2026-12-21", 1, 0],
      ["2026-12-28", 1, 1],
    ]);
    expect(
      summarize([a, b, c], { today: "2027-01-01", programId: "archived" })
        .partial,
    ).toBe(1);
    expect(listPrograms([c])).toEqual([
      { id: "archived", name: "Archived Program", historical: true },
    ]);
    expect(listExercises([c])).toEqual([{ id: "squats", name: "squats" }]);
  });

  it("counts midnight activity dates but only one starting session", () => {
    const a = session("a", "2026-10-31", [10, 10, null]);
    a.sets[1].activityDate = "2026-11-01";
    const calendar = calendarActivity([a]);
    expect(calendar).toHaveLength(2);
    expect(calendar[0]).toMatchObject({
      date: "2026-10-31",
      partial: 1,
      repetitions: 10,
    });
    expect(calendar[1]).toMatchObject({
      date: "2026-11-01",
      partial: 0,
      repetitions: 10,
      sessionIds: ["a"],
    });
    expect(monthlyConsistency([a], { month: "2026-11" })).toEqual({
      month: "2026-11",
      completed: 0,
      partial: 0,
      repetitions: 10,
      trainingDays: 1,
    });
  });

  it("distinguishes zero logs and all-skipped sessions from positive activity", () => {
    const a = session("a", "2026-10-26", [0, 0, 0]);
    const b = session("b", "2026-10-27", [null, null, null]);
    const cells = calendarActivity([a, b]);
    expect(cells[0]).toMatchObject({
      recordedSets: 3,
      zeroOnly: true,
      hasActivity: false,
    });
    expect(cells[1]).toMatchObject({
      recordedSets: 0,
      zeroOnly: false,
      hasActivity: false,
      partial: 1,
    });
    expect(summarize([a, b], { today: "2026-10-29" }).trainingDays).toBe(0);
    expect(calendarActivity([], { month: "2028-02" })).toHaveLength(29);
  });
});

describe("exercise series and records", () => {
  it("shows 5-to-15 improvement without converting missing sets to zero", () => {
    const a = session("a", "2026-10-01", [5, 4, 3], "push-ups");
    const b = session("b", "2026-10-20", [null, 15, 10], "push-ups");
    expect(
      exerciseProgress([b, a], "push-ups").map((point) => point.value),
    ).toEqual([5, 15]);
    expect(
      exerciseProgress([b, a], "push-ups", { mode: "set1" }).map(
        (point) => point.value,
      ),
    ).toEqual([5, null]);
    expect(
      exerciseProgress([b, a], "push-ups", { mode: "total" }).map(
        (point) => point.value,
      ),
    ).toEqual([12, null]);
    const records = exerciseRecords([b, a], "push-ups");
    expect(records.bestSet).toMatchObject({ value: 15, outcome: "partial" });
    expect(records.bestTotal).toMatchObject({
      value: 12,
      outcome: "completed",
    });
    expect(records.totalReps).toBe(37);
  });

  it("uses deterministic ordering and earliest tied records", () => {
    const a = session("a", "2026-10-01", [0, 0, 0]);
    const b = session("b", "2026-10-01", [0, 0, 0]);
    expect(
      exerciseProgress([b, a], "squats").map((point) => point.sessionId),
    ).toEqual(["a", "b"]);
    expect(exerciseRecords([b, a], "squats").bestSet?.sessionId).toBe("a");
    expect(exerciseProgress([], "squats")).toEqual([]);
    expect(exerciseRecords([], "squats").bestSet).toBeNull();
  });
});

describe("recovery guidance", () => {
  it("uses current zone for observed timestamps while preserving historical labels", () => {
    const a = session("a", "2026-10-27", [5, null, null]);
    a.sets[0].recordedAt = "2026-10-28T23:30:00.000Z";
    const result = recoveryActivity(
      [a],
      null,
      new Date("2026-10-29T12:00:00Z"),
      "conditioning",
      "Asia/Shanghai",
    );
    expect(result.today).toBe(true);
    expect(a.sets[0].activityDate).toBe("2026-10-27");
  });

  it("uses explicit dates for manually corrected records and excludes zero", () => {
    const a = session("a", "2026-10-28", [5, 0, null]);
    a.sets[0].recordedAt = null;
    a.sets[0].origin = "manual-correction";
    a.sets[1].activityDate = "2026-10-29";
    expect(
      recoveryActivity(
        [a],
        null,
        new Date("2026-10-29T12:00:00Z"),
        undefined,
        "UTC",
      ),
    ).toMatchObject({ warning: true, today: false, yesterday: true });
    expect(
      recoveryActivity(
        [a],
        null,
        new Date("2026-10-31T12:00:00Z"),
        undefined,
        "UTC",
      ).warning,
    ).toBe(false);
  });
});

describe("large history selectors", () => {
  it("processes 5,000 sessions without mutating source records", () => {
    const sessions = Array.from({ length: 5000 }, (_, i) =>
      session(
        `session-${i}`,
        "2026-10-26",
        Array.from({ length: 18 }, () => 20),
      ),
    );
    const began = performance.now();
    expect(summarize(sessions, { today: "2026-10-29" }).totalReps).toBe(
      1800000,
    );
    expect(
      weeklyConsistency(sessions, { today: "2026-10-29", weeks: 12 }).at(-1)
        ?.completed,
    ).toBe(5000);
    expect(calendarActivity(sessions)[0].sessionIds).toHaveLength(5000);
    expect(exerciseProgress(sessions, "squats")).toHaveLength(5000);
    expect(sessions[0].id).toBe("session-0");
    // Includes all four core views over 90,000 set records; a broad budget avoids microbenchmark noise.
    expect(performance.now() - began).toBeLessThan(2000);
  });
});
