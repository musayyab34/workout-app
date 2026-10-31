import type { Draft, Program, Session, SetRecord } from "@/domain/schemas";
import {
  addCalendarDays,
  datesInMonth,
  localDateKey,
  mondayOfWeek,
} from "./calendar";

export * from "./calendar";

export type StatisticsFilter = {
  programId?: string;
  fromDate?: string;
  toDate?: string;
};
export type ChartMode = "best" | "set1" | "total";

export function filterSessions(
  sessions: readonly Session[],
  filter: StatisticsFilter = {},
): Session[] {
  return sessions.filter(
    (session) =>
      (!filter.programId || session.snapshot.programId === filter.programId) &&
      (!filter.fromDate || session.startLocalDate >= filter.fromDate) &&
      (!filter.toDate || session.startLocalDate <= filter.toDate),
  );
}

export function chronological(sessions: readonly Session[]): Session[] {
  return [...sessions].sort(
    (a, b) =>
      a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
}

export function actualRepetitions(sets: readonly SetRecord[]): number {
  return sets.reduce(
    (sum, set) => sum + (set.status === "recorded" ? (set.actualReps ?? 0) : 0),
    0,
  );
}

export function targetAttainment(sets: readonly SetRecord[]) {
  let prescribed = 0;
  let credited = 0;
  let actual = 0;
  for (const set of sets) {
    if (set.target.type !== "fixed") continue;
    prescribed += set.target.reps;
    const reps = set.status === "recorded" ? (set.actualReps ?? 0) : 0;
    actual += reps;
    credited += Math.min(reps, set.target.reps);
  }
  return {
    prescribed,
    credited,
    actual,
    percent: prescribed > 0 ? (credited / prescribed) * 100 : null,
  };
}

export function sessionDuration(session: Session): number {
  return session.correctedDurationMs ?? session.calculatedDurationMs;
}

export function summarize(
  sessions: readonly Session[],
  options: StatisticsFilter & { today?: string } = {},
) {
  const selected = filterSessions(sessions, options);
  const today = options.today ?? localDateKey();
  const weekStart = mondayOfWeek(today);
  const weekEnd = addCalendarDays(weekStart, 6);
  let completed = 0;
  let partial = 0;
  let thisWeek = 0;
  let totalReps = 0;
  let totalDurationMs = 0;
  const trainingDates = new Set<string>();
  const exerciseTotals: Record<string, number> = {};
  for (const session of selected) {
    if (session.outcome === "completed") {
      completed++;
      totalDurationMs += sessionDuration(session);
      if (
        session.startLocalDate >= weekStart &&
        session.startLocalDate <= weekEnd
      )
        thisWeek++;
    } else partial++;
    for (const set of session.sets) {
      if (set.status !== "recorded") continue;
      const reps = set.actualReps ?? 0;
      totalReps += reps;
      exerciseTotals[set.exerciseId] =
        (exerciseTotals[set.exerciseId] ?? 0) + reps;
      if (reps > 0 && set.activityDate) trainingDates.add(set.activityDate);
    }
  }
  return {
    completed,
    partial,
    thisWeek,
    totalReps,
    trainingDays: trainingDates.size,
    avgDurationMs: completed ? totalDurationMs / completed : null,
    totalDurationMs,
    exerciseTotals,
    sessionCount: selected.length,
    attainment: targetAttainment(selected.flatMap((session) => session.sets)),
  };
}

export function weeklyConsistency(
  sessions: readonly Session[],
  options: StatisticsFilter & { today?: string; weeks?: number } = {},
) {
  const today = options.today ?? localDateKey();
  const count = Math.max(1, Math.min(520, Math.floor(options.weeks ?? 12)));
  const lastStart = mondayOfWeek(today);
  const firstStart = addCalendarDays(lastStart, -7 * (count - 1));
  const buckets = new Map<
    string,
    {
      startDate: string;
      endDate: string;
      completed: number;
      partial: number;
      goal: number;
      repetitions: number;
      trainingDays: number;
    }
  >();
  const positiveDates = new Map<string, Set<string>>();
  for (let i = 0; i < count; i++) {
    const startDate = addCalendarDays(firstStart, i * 7);
    buckets.set(startDate, {
      startDate,
      endDate: addCalendarDays(startDate, 6),
      completed: 0,
      partial: 0,
      goal: 3,
      repetitions: 0,
      trainingDays: 0,
    });
    positiveDates.set(startDate, new Set());
  }
  for (const session of filterSessions(sessions, options)) {
    const bucket = buckets.get(mondayOfWeek(session.startLocalDate));
    if (bucket) {
      bucket[session.outcome]++;
      bucket.repetitions += actualRepetitions(session.sets);
    }
    for (const set of session.sets) {
      if (
        set.status === "recorded" &&
        (set.actualReps ?? 0) > 0 &&
        set.activityDate
      ) {
        positiveDates
          .get(mondayOfWeek(set.activityDate))
          ?.add(set.activityDate);
      }
    }
  }
  for (const [key, bucket] of buckets)
    bucket.trainingDays = positiveDates.get(key)?.size ?? 0;
  return [...buckets.values()];
}

export function monthlyConsistency(
  sessions: readonly Session[],
  options: StatisticsFilter & { month?: string } = {},
) {
  const month = options.month ?? localDateKey().slice(0, 7);
  datesInMonth(month); // Validate even an empty dataset.
  const selected = filterSessions(sessions, options);
  const dates = new Set<string>();
  let completed = 0;
  let partial = 0;
  let repetitions = 0;
  for (const session of selected) {
    if (session.startLocalDate.startsWith(month)) {
      if (session.outcome === "completed") completed++;
      else partial++;
    }
    for (const set of session.sets) {
      if (set.status !== "recorded" || !set.activityDate?.startsWith(month))
        continue;
      repetitions += set.actualReps ?? 0;
      if ((set.actualReps ?? 0) > 0) dates.add(set.activityDate);
    }
  }
  return { month, completed, partial, trainingDays: dates.size, repetitions };
}

export type CalendarActivity = {
  date: string;
  completed: number;
  partial: number;
  sessionIds: string[];
  recordedSets: number;
  repetitions: number;
  hasActivity: boolean;
  zeroOnly: boolean;
};

export function calendarActivity(
  sessions: readonly Session[],
  options: StatisticsFilter & { month?: string } = {},
): CalendarActivity[] {
  const buckets = new Map<string, CalendarActivity>();
  const sessionIdsByDate = new Map<string, Set<string>>();
  const ensure = (date: string) => {
    if (options.month && !date.startsWith(options.month)) return null;
    let bucket = buckets.get(date);
    if (!bucket) {
      bucket = {
        date,
        completed: 0,
        partial: 0,
        sessionIds: [],
        recordedSets: 0,
        repetitions: 0,
        hasActivity: false,
        zeroOnly: false,
      };
      buckets.set(date, bucket);
      sessionIdsByDate.set(date, new Set());
    }
    return bucket;
  };
  if (options.month)
    for (const date of datesInMonth(options.month)) ensure(date);
  for (const session of filterSessions(sessions, options)) {
    const startBucket = ensure(session.startLocalDate);
    if (startBucket) {
      startBucket[session.outcome]++;
      startBucket.sessionIds.push(session.id);
      sessionIdsByDate.get(startBucket.date)?.add(session.id);
    }
    for (const set of session.sets) {
      if (set.status !== "recorded" || !set.activityDate) continue;
      const bucket = ensure(set.activityDate);
      if (!bucket) continue;
      const ids = sessionIdsByDate.get(bucket.date)!;
      if (!ids.has(session.id)) {
        bucket.sessionIds.push(session.id);
        ids.add(session.id);
      }
      bucket.recordedSets++;
      bucket.repetitions += set.actualReps ?? 0;
    }
  }
  for (const bucket of buckets.values()) {
    bucket.hasActivity = bucket.repetitions > 0;
    bucket.zeroOnly = bucket.recordedSets > 0 && bucket.repetitions === 0;
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type ExercisePoint = {
  sessionId: string;
  date: string;
  startedAt: string;
  value: number | null;
  values: (number | null)[];
  total: number;
  fullExercise: boolean;
  outcome: Session["outcome"];
  programVersion: number;
  targetLabel: string;
};

export function exerciseProgress(
  sessions: readonly Session[],
  exerciseId: string,
  options: StatisticsFilter & {
    mode?: ChartMode;
    entryId?: string;
    setCount?: number;
  } = {},
): ExercisePoint[] {
  const mode = options.mode ?? "best";
  return chronological(filterSessions(sessions, options)).flatMap((session) => {
    const sets = session.sets.filter(
      (set) =>
        set.exerciseId === exerciseId &&
        (!options.entryId || set.exerciseEntryId === options.entryId),
    );
    if (options.setCount !== undefined && sets.length !== options.setCount)
      return [];
    if (!sets.length) return [];
    const recorded = sets.filter((set) => set.status === "recorded");
    const total = actualRepetitions(sets);
    const fullExercise = recorded.length === sets.length;
    let value: number | null = null;
    if (mode === "best" && recorded.length)
      value = Math.max(...recorded.map((set) => set.actualReps ?? 0));
    else if (mode === "set1") {
      const first =
        new Set(sets.map((s) => s.exerciseEntryId)).size === 1
          ? sets.find((set) => set.setNumber === 1)
          : undefined;
      if (first?.status === "recorded") value = first.actualReps;
    } else if (
      mode === "total" &&
      fullExercise &&
      new Set(sets.map((s) => s.exerciseEntryId)).size === 1
    )
      value = total;
    const targets = [
      ...new Set(
        sets.map((set) =>
          set.target.type === "fixed"
            ? `${set.target.reps} reps`
            : set.target.type === "submaximal"
              ? "Submaximal"
              : "Until muscular burning",
        ),
      ),
    ];
    return [
      {
        sessionId: session.id,
        date: session.startLocalDate,
        startedAt: session.startedAt,
        value,
        values: sets.map((set) =>
          set.status === "recorded" ? set.actualReps : null,
        ),
        total,
        fullExercise,
        outcome: session.outcome,
        programVersion: session.snapshot.programVersion,
        targetLabel: targets.join(" / "),
      },
    ];
  });
}

export function exerciseRecords(
  sessions: readonly Session[],
  exerciseId: string,
  options: StatisticsFilter & { entryId?: string; setCount?: number } = {},
) {
  const bestPoints = exerciseProgress(sessions, exerciseId, {
    ...options,
    mode: "best",
  });
  const totalPoints = exerciseProgress(sessions, exerciseId, {
    ...options,
    mode: "total",
  });
  const best = (points: ExercisePoint[]) =>
    points.reduce<ExercisePoint | null>(
      (record, point) =>
        point.value !== null &&
        (record === null || point.value > (record.value ?? -1))
          ? point
          : record,
      null,
    );
  return {
    bestSet: best(bestPoints),
    bestTotal: best(
      totalPoints.filter(
        (p) =>
          p.values.length ===
          (options.setCount ?? totalPoints.at(-1)?.values.length),
      ),
    ),
    comparisonSetCount: options.setCount ?? totalPoints.at(-1)?.values.length,
    totalReps: bestPoints.reduce((sum, point) => sum + point.total, 0),
    sessions: bestPoints.length,
  };
}

export function listPrograms(
  sessions: readonly Session[],
  catalog: readonly Program[] = [],
) {
  const programs = new Map(
    catalog.map((program) => [
      program.id,
      { id: program.id, name: program.name, historical: false },
    ]),
  );
  for (const session of chronological(sessions)) {
    if (!programs.has(session.snapshot.programId))
      programs.set(session.snapshot.programId, {
        id: session.snapshot.programId,
        name: session.snapshot.programName,
        historical: true,
      });
  }
  return [...programs.values()];
}

export function listExercises(
  sessions: readonly Session[],
  options: StatisticsFilter = {},
  catalog: readonly Program[] = [],
) {
  const exercises = new Map<string, { id: string; name: string }>();
  for (const program of catalog) {
    if (options.programId && program.id !== options.programId) continue;
    for (const template of program.templates)
      for (const exercise of template.exercises) {
        if (!exercises.has(exercise.exerciseId))
          exercises.set(exercise.exerciseId, {
            id: exercise.exerciseId,
            name: exercise.name,
          });
      }
  }
  for (const session of chronological(filterSessions(sessions, options)))
    for (const exercise of session.snapshot.exercises) {
      if (!exercises.has(exercise.exerciseId))
        exercises.set(exercise.exerciseId, {
          id: exercise.exerciseId,
          name: exercise.name,
        });
    }
  return [...exercises.values()];
}

/** Recovery warnings use the user's current zone without rewriting historical date keys. */
export function recoveryActivity(
  sessions: readonly Session[],
  draft: Draft | null = null,
  now: Date | number = new Date(),
  programId?: string,
  timeZone?: string,
) {
  const todayDate = localDateKey(now, timeZone);
  const yesterdayDate = addCalendarDays(todayDate, -1);
  const all = draft ? [...sessions, draft] : sessions;
  const dates = new Set<string>();
  for (const session of all) {
    if (programId && session.snapshot.programId !== programId) continue;
    for (const set of session.sets) {
      if (set.status !== "recorded" || (set.actualReps ?? 0) <= 0) continue;
      const date = set.recordedAt
        ? localDateKey(set.recordedAt, timeZone)
        : set.activityDate;
      if (date) dates.add(date);
    }
  }
  const today = dates.has(todayDate);
  const yesterday = dates.has(yesterdayDate);
  const sorted = [...dates].sort();
  return {
    warning: today || yesterday,
    today,
    yesterday,
    dates: sorted,
    lastActivityDate: sorted.at(-1) ?? null,
    message:
      today || yesterday
        ? `You recorded training ${today ? "today" : "yesterday"}. Your mentor says never train on consecutive days and to leave at least one recovery day between sessions.`
        : null,
  };
}
