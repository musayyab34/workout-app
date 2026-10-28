"use client";
import { useState } from "react";
import { useApp } from "@/features/workout/provider";
import { conditioningProgram, programs } from "@/programs/catalog";
import {
  summarize,
  weeklyConsistency,
  exerciseProgress,
  exerciseRecords,
  listPrograms,
  listExercises,
  localDateKey,
  addCalendarDays,
  type ChartMode,
} from "@/features/statistics";
import { formatDuration } from "@/lib/time";
import { PageHeading, Stat, Icon } from "@/components/ui";
import { Calendar } from "@/components/history";
import { ExerciseChart, WeeklyChart } from "@/components/charts";
export default function Progress() {
  const app = useApp();
  const [program, setProgram] = useState(conditioningProgram.id),
    [exercise, setExercise] = useState("push-ups"),
    [mode, setMode] = useState<ChartMode>("best"),
    [range, setRange] = useState("12");
  const allPrograms = listPrograms(
    app.data.sessions,
    programs.filter((p) => p.availability === "active"),
  );
  const stats = summarize(app.data.sessions, { programId: program });
  const exercises = listExercises(
    app.data.sessions,
    { programId: program },
    programs,
  );
  const current = exercises.find((e) => e.id === exercise) ?? exercises[0];
  const selected = app.data.sessions.filter(
    (s) => s.snapshot.programId === program,
  );
  const fromDate =
    range === "all"
      ? undefined
      : addCalendarDays(localDateKey(), -7 * Number(range) + 1);
  const points = current
    ? exerciseProgress(selected, current.id, { mode, fromDate })
    : [];
  const records = current ? exerciseRecords(selected, current.id) : null;
  if (!app.ready)
    return (
      <>
        <PageHeading
          eyebrow="The bigger picture"
          title="Progress, at your pace."
        />
        <div className="loading">Loading your progress…</div>
      </>
    );
  return (
    <>
      <PageHeading eyebrow="The bigger picture" title="Progress, at your pace.">
        Honest results. Meaningful patterns. Keep showing up.
      </PageHeading>
      <div className="filter-bar">
        <label className="field">
          <span>Training program</span>
          <select value={program} onChange={(e) => setProgram(e.target.value)}>
            {allPrograms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.historical ? " (historical)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="small muted">
          Saved sessions only · drafts excluded
        </span>
      </div>
      <div className="stat-grid">
        <Stat
          label="Completed workouts"
          value={app.ready ? stats.completed : "—"}
          detail={`${stats.partial} partial sessions separately`}
        />
        <Stat
          label="Completed this week"
          value={app.ready ? `${stats.thisWeek} / ~3` : "—"}
          detail="Monday through Sunday"
        />
        <Stat
          label="Actual repetitions"
          value={app.ready ? stats.totalReps.toLocaleString() : "—"}
          detail="Includes recorded sets in partial sessions"
        />
        <Stat
          label="Average elapsed time"
          value={
            stats.avgDurationMs === null
              ? "—"
              : formatDuration(stats.avgDurationMs)
          }
          detail="Completed sessions only"
        />
      </div>
      <div className="two-col">
        <div className="stack">
          <section className="card">
            <div className="section-head">
              <h2>Weekly consistency</h2>
              <Icon name="chart" size={18} />
            </div>
            <WeeklyChart weeks={weeklyConsistency(selected, { weeks: 12 })} />
          </section>
          <section className="card">
            <div className="section-head">
              <h2>Exercise progress</h2>
              <Icon name="chart" size={18} />
            </div>
            <div className="chart-controls" style={{ marginBottom: 25 }}>
              <select
                aria-label="Exercise"
                value={current?.id ?? ""}
                onChange={(e) => setExercise(e.target.value)}
              >
                {exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Performance metric"
                value={mode}
                onChange={(e) => setMode(e.target.value as ChartMode)}
              >
                <option value="best">Best set</option>
                <option value="set1">Set 1</option>
                <option value="total">Full-exercise total</option>
              </select>
              <select
                aria-label="Chart date range"
                value={range}
                onChange={(e) => setRange(e.target.value)}
              >
                <option value="4">Last 4 weeks</option>
                <option value="12">Last 12 weeks</option>
                <option value="all">All time</option>
              </select>
            </div>
            <ExerciseChart
              points={points}
              label={
                mode === "best"
                  ? "Best set"
                  : mode === "set1"
                    ? "Set 1"
                    : "Full-exercise total"
              }
            />
          </section>
        </div>
        <aside className="stack">
          <section className="card">
            <div className="section-head">
              <h2>Your calendar</h2>
            </div>
            <Calendar sessions={selected} />
          </section>
          <section className="card">
            <div className="section-head">
              <h2>Personal records</h2>
              <Icon name="trophy" size={19} />
            </div>
            <p className="small">
              {current?.name ?? "Choose an exercise"} · all time
            </p>
            <div className="setting-row">
              <span className="small muted">Best set</span>
              <strong className="mint-text">
                {records?.bestSet?.value ?? "—"}{" "}
                {records?.bestSet ? "reps" : ""}
              </strong>
            </div>
            <div className="setting-row">
              <span className="small muted">Best full exercise</span>
              <strong>
                {records?.bestTotal?.value ?? "—"}{" "}
                {records?.bestTotal ? "reps" : ""}
              </strong>
            </div>
            <div className="setting-row">
              <span className="small muted">Total repetitions</span>
              <strong>{records?.totalReps ?? 0}</strong>
            </div>
            <p className="small" style={{ marginTop: 14 }}>
              Best sets can come from partial sessions. Keep good technique and
              stay below failure.
            </p>
          </section>
          <section className="card">
            <h3>Against your fixed targets</h3>
            <strong
              className="mint-text"
              style={{ fontSize: 32, display: "block", margin: "12px 0" }}
            >
              {stats.attainment.percent === null
                ? "—"
                : `${Math.round(stats.attainment.percent)}%`}
            </strong>
            <p className="small">
              {stats.attainment.credited} credited /{" "}
              {stats.attainment.prescribed} prescribed reps across saved
              sessions. Each set is capped at its own target. Push-ups and
              tibialis raises have qualitative targets and are excluded.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
