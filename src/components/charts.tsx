"use client";
import { useId, useState } from "react";
import Link from "next/link";
import type { ExercisePoint } from "@/features/statistics";
import { formatCalendarDate } from "@/features/statistics";
import { Button, Empty } from "./ui";
export function ExerciseChart({
  points,
  label,
}: {
  points: ExercisePoint[];
  label: string;
}) {
  const id = useId();
  const [tableLimit, setTableLimit] = useState(200);
  const known = points.filter((p) => p.value !== null);
  if (!known.length)
    return (
      <Empty title="Progress starts with a recorded set">
        Your {label.toLowerCase()} results will appear here after saving a
        workout.
      </Empty>
    );
  const width = 700,
    height = 235,
    left = 38,
    right = 20,
    top = 16,
    bottom = 36;
  const max = Math.max(5, ...known.map((p) => p.value ?? 0));
  const x = (i: number) =>
    left +
    (points.length === 1
      ? (width - left - right) / 2
      : (i / (points.length - 1)) * (width - left - right));
  const y = (n: number) =>
    height - bottom - (n / max) * (height - top - bottom);
  const segments: string[] = [];
  let active = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (active) segments.push(active);
      active = "";
    } else active += `${active ? " L" : "M"}${x(i)},${y(p.value)}`;
  });
  if (active) segments.push(active);
  const versionChange =
    new Set(points.map((p) => `${p.programVersion}:${p.targetLabel}`)).size > 1;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}>
        <title id={id}>
          {label}: {known.length} recorded sessions. Latest{" "}
          {known.at(-1)?.value} repetitions.
        </title>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              className="chart-grid"
              x1={left}
              x2={width - right}
              y1={y(max * t)}
              y2={y(max * t)}
            />
            <text
              className="chart-label"
              x={left - 10}
              y={y(max * t) + 4}
              textAnchor="end"
            >
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2"
          />
        ))}
        {points.map((p, i) =>
          p.value === null ? null : (
            <circle
              key={p.sessionId}
              cx={x(i)}
              cy={y(p.value)}
              r={points.length > 80 ? 2 : 4}
              fill="var(--accent)"
            >
              <title>
                {formatCalendarDate(p.date)}: {p.value} reps · {p.outcome} ·
                Sets {p.values.map((v) => v ?? "—").join(" / ")}
              </title>
            </circle>
          ),
        )}
        <text className="chart-label" x={left} y={height - 8}>
          {formatCalendarDate(points[0].date)}
        </text>
        <text
          className="chart-label"
          x={width - right}
          y={height - 8}
          textAnchor="end"
        >
          {formatCalendarDate(points.at(-1)!.date)}
        </text>
      </svg>
      <p className="small">
        Latest:{" "}
        <strong className="mint-text">{known.at(-1)?.value} reps</strong> ·
        Missing sets are gaps, never zero.
        {versionChange
          ? " Prescription versions or targets changed; compare session details."
          : ""}
      </p>
      <details>
        <summary>View session data</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{label}</th>
                <th>Sets</th>
                <th>Outcome</th>
                <th>Prescription</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(-tableLimit).map((p) => (
                <tr key={p.sessionId}>
                  <td>
                    <Link
                      className="text-link"
                      href={`/history/${p.sessionId}`}
                    >
                      {p.date}
                    </Link>
                  </td>
                  <td>{p.value ?? "—"}</td>
                  <td>{p.values.map((v) => v ?? "—").join(" / ")}</td>
                  <td>
                    {p.outcome === "completed" ? "All recorded" : "Partial"}
                  </td>
                  <td>
                    v{p.programVersion} · {p.targetLabel}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {points.length > tableLimit && (
          <div>
            <p>
              Showing the latest {tableLimit} of {points.length} rows.
            </p>
            <Button
              variant="secondary"
              onClick={() => setTableLimit((n) => n + 200)}
            >
              Show older chart data
            </Button>
          </div>
        )}
      </details>
    </div>
  );
}
export function WeeklyChart({
  weeks,
}: {
  weeks: {
    startDate: string;
    completed: number;
    partial: number;
    goal: number;
  }[];
}) {
  const id = useId();
  const max = Math.max(4, ...weeks.map((w) => w.completed));
  const width = 700,
    height = 180,
    left = 28,
    bottom = 27,
    top = 12;
  const spacing = (width - left - 12) / weeks.length,
    bar = Math.min(30, spacing * 0.48);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={id}>
        <title id={id}>
          Weekly completed workouts. Approximate goal: three, with recovery
          days.
        </title>
        {[0, 3, max].map((n, i) => (
          <g key={i}>
            <line
              x1={left}
              x2={width - 10}
              y1={height - bottom - ((height - top - bottom) * n) / max}
              y2={height - bottom - ((height - top - bottom) * n) / max}
              className="chart-grid"
              strokeDasharray={n === 3 ? "4 4" : undefined}
            />
            <text
              x={left - 8}
              y={height - bottom - ((height - top - bottom) * n) / max + 4}
              className="chart-label"
              textAnchor="end"
            >
              {n}
            </text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <g key={w.startDate}>
            <rect
              x={left + i * spacing + (spacing - bar) / 2}
              y={
                height - bottom - ((height - top - bottom) * w.completed) / max
              }
              width={bar}
              height={Math.max(
                2,
                ((height - top - bottom) * w.completed) / max,
              )}
              rx="3"
              fill={i === weeks.length - 1 ? "var(--accent)" : "#72e0c34a"}
            >
              <title>
                Week of {w.startDate}: {w.completed} all recorded, {w.partial}{" "}
                partial
              </title>
            </rect>
            {(i === 0 || i === weeks.length - 1 || weeks.length <= 6) && (
              <text
                x={left + i * spacing + spacing / 2}
                y={height - 5}
                className="chart-label"
                textAnchor="middle"
              >
                {formatCalendarDate(w.startDate)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="small">
        Approximate goal: 3 per week. Always leave a recovery day.
      </p>
      <details>
        <summary>View weekly data</summary>
        <table>
          <thead>
            <tr>
              <th>Week of</th>
              <th>All sets recorded</th>
              <th>Partial</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.startDate}>
                <td>{w.startDate}</td>
                <td>{w.completed}</td>
                <td>{w.partial}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
