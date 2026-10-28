"use client";
import { useMemo, useState } from "react";
import { useApp } from "@/features/workout/provider";
import { programs } from "@/programs/catalog";
import {
  calendarActivity,
  chronological,
  listPrograms,
} from "@/features/statistics";
import { Calendar, SessionRows } from "@/components/history";
import { PageHeading, Empty, Button, ActionLink } from "@/components/ui";
export default function History() {
  const app = useApp();
  const [program, setProgram] = useState(""),
    [selected, setSelected] = useState(""),
    [limit, setLimit] = useState(20);
  const sessions = useMemo(
    () =>
      chronological(
        app.data.sessions.filter(
          (s) => !program || s.snapshot.programId === program,
        ),
      ).reverse(),
    [app.data.sessions, program],
  );
  const ids = selected
    ? (calendarActivity(sessions).find((d) => d.date === selected)
        ?.sessionIds ?? [])
    : null;
  const displayed = ids ? sessions.filter((s) => ids.includes(s.id)) : sessions;
  return (
    <>
      <PageHeading
        eyebrow="Your training log"
        title="Every session, remembered."
      >
        A record of your effort, exactly as you logged it.
      </PageHeading>
      <div className="filter-bar">
        <label className="field">
          <span>Program</span>
          <select
            value={program}
            onChange={(e) => {
              setProgram(e.target.value);
              setLimit(20);
              setSelected("");
            }}
          >
            <option value="">All programs</option>
            {listPrograms(
              app.data.sessions,
              programs.filter((p) => p.availability === "active"),
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.historical ? " (historical)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="small muted">{sessions.length} saved sessions</span>
      </div>
      <div className="two-col">
        <section className="card">
          <div className="section-head">
            <h2>{selected ? `Activity on ${selected}` : "Workout history"}</h2>
            {selected && (
              <Button variant="ghost" onClick={() => setSelected("")}>
                Clear date
              </Button>
            )}
          </div>
          {!app.ready ? (
            <div className="loading">Loading sessions…</div>
          ) : displayed.length ? (
            <>
              <SessionRows sessions={displayed.slice(0, limit)} />
              {displayed.length > limit && (
                <Button
                  variant="secondary"
                  className="full"
                  style={{ marginTop: 20 }}
                  onClick={() => setLimit((n) => n + 20)}
                >
                  Show more sessions
                </Button>
              )}
            </>
          ) : (
            <Empty
              title={
                selected
                  ? "No sessions on this date"
                  : "Your training log starts here"
              }
              icon="history"
              action={
                !selected ? (
                  <ActionLink href="/">Find your program</ActionLink>
                ) : undefined
              }
            >
              {selected
                ? "Choose another day or clear the date filter."
                : "Finish and save a workout to see your results here."}
            </Empty>
          )}
        </section>
        <aside className="card">
          <div className="section-head">
            <h2>Activity calendar</h2>
          </div>
          <Calendar
            sessions={sessions}
            selected={selected}
            onSelect={(day) => {
              setSelected(selected === day ? "" : day);
              setLimit(20);
            }}
          />
        </aside>
      </div>
    </>
  );
}
