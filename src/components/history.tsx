"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Session } from "@/domain/schemas";
import {
  calendarActivity,
  monthGrid,
  localDateKey,
  formatCalendarDate,
  monthlyConsistency,
} from "@/features/statistics";
import { actualRepetitions, sessionDuration } from "@/features/statistics";
import { formatDuration } from "@/lib/time";
import { Badge, Button, Icon } from "./ui";
import { useApp } from "@/features/workout/provider";
export function SessionRows({ sessions }: { sessions: Session[] }) {
  return (
    <div>
      {sessions.map((session) => (
        <Link
          key={session.id}
          className="session-row"
          href={`/history/${session.id}`}
        >
          <span className="date-tile">
            {session.startLocalDate.slice(-2)}
            <small>
              {formatCalendarDate(session.startLocalDate, { month: "short" })}
            </small>
          </span>
          <div className="session-main">
            <h3>{session.snapshot.programName}</h3>
            <p>
              {actualRepetitions(session.sets)} reps ·{" "}
              {formatDuration(sessionDuration(session))}
              {session.correctedDurationMs !== null ? " (corrected)" : ""}
            </p>
          </div>
          <Badge tone={session.outcome === "completed" ? "mint" : "warning"}>
            {session.outcome === "completed" ? "All recorded" : "Partial"}
          </Badge>
          <Icon size={16} />
        </Link>
      ))}
    </div>
  );
}
export function Calendar({
  sessions,
  onSelect,
  selected,
}: {
  sessions: Session[];
  onSelect?: (date: string) => void;
  selected?: string;
}) {
  const { ready } = useApp();
  const [month, setMonth] = useState(() => localDateKey().slice(0, 7));
  const today = localDateKey();
  const activity = useMemo(
    () =>
      new Map(
        calendarActivity(sessions, { month }).map((day) => [day.date, day]),
      ),
    [sessions, month],
  );
  const summary = monthlyConsistency(sessions, { month });
  const shift = (offset: number) => {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1 + offset, 1));
    setMonth(
      `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  };
  if (!ready) return <div className="loading">Loading calendar…</div>;
  return (
    <div>
      <div className="row between">
        <span className="calendar-month">
          {formatCalendarDate(`${month}-01`, {
            month: "long",
            year: "numeric",
          })}
        </span>
        <div className="row">
          <Button
            variant="ghost"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            aria-label="Next month"
            onClick={() => shift(1)}
          >
            ›
          </Button>
        </div>
      </div>
      <div className="calendar-grid">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span className="weekday" key={i}>
            {d}
          </span>
        ))}
        {monthGrid(month).map((day) => {
          const info = activity.get(day),
            outside = !day.startsWith(month);
          return outside ? (
            <span key={day} />
          ) : (
            <button
              key={day}
              type="button"
              className={`calendar-day ${info?.hasActivity ? "positive" : ""} ${info?.recordedSets ? "logged" : ""} ${selected === day ? "selected" : ""} ${today === day ? "today" : ""}`}
              aria-label={`${formatCalendarDate(day, { month: "long", day: "numeric", year: "numeric" })}: ${info?.repetitions ?? 0} reps, ${info?.completed ?? 0} all-sets-recorded workouts${info?.zeroOnly ? ", zero-only log" : ""}`}
              aria-pressed={selected === day}
              onClick={() => onSelect?.(day)}
            >
              {Number(day.slice(-2))}
            </button>
          );
        })}
      </div>
      <div className="calendar-legend">
        <span>
          <i className="legend-dot" />
          Repetitions recorded
        </span>
        <span>Outlined: set result logged</span>
      </div>
      <p className="month-summary">
        {summary.completed} all-sets-recorded · {summary.partial} partial
        <br />
        {summary.trainingDays} training days · {summary.repetitions} reps this
        month
      </p>
    </div>
  );
}
