"use client";
import Link from "next/link";
import { useApp } from "@/features/workout/provider";
import { programs, conditioningProgram } from "@/programs/catalog";
import { summarize, chronological } from "@/features/statistics";
import { PageHeading, Icon, Badge, ActionLink, Empty } from "@/components/ui";
import { Calendar, SessionRows } from "@/components/history";
export default function Home() {
  const app = useApp();
  const stats = summarize(app.data.sessions, {
    programId: conditioningProgram.id,
  });
  const recent = chronological(app.data.sessions).reverse().slice(0, 3);
  return (
    <>
      <PageHeading eyebrow="Your training space" title="Build your foundation.">
        Small efforts. Steady progress. A stronger you.
      </PageHeading>
      {app.data.draft && (
        <div className="notice">
          <div>
            <strong>
              {app.data.draft.phase === "review"
                ? "Your workout is ready to review"
                : "Pick up where you left off"}
            </strong>
            <p>
              {app.data.draft.snapshot.programName} ·{" "}
              {
                app.data.draft.sets.filter((s) => s.status === "recorded")
                  .length
              }{" "}
              sets recorded
            </p>
          </div>
          <ActionLink
            href={
              app.data.draft.phase === "review"
                ? "/workout/summary"
                : "/workout"
            }
          >
            {app.data.draft.phase === "review"
              ? "Review workout"
              : "Resume Workout"}
            <Icon />
          </ActionLink>
        </div>
      )}
      <section className="hero" aria-label="Training overview">
        <div className="hero-main">
          <svg
            className="hero-art"
            viewBox="0 0 300 300"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="150" cy="150" r="130" />
            <circle cx="150" cy="150" r="105" />
            <circle cx="150" cy="150" r="80" />
            <circle cx="150" cy="150" r="55" />
            <path d="M0 150h300M150 0v300M45 45l210 210M45 255 255 45" />
          </svg>
          <div>
            <Badge tone="mint">Your next session</Badge>
            <h2>
              A stronger start.
              <br />
              One set at a time.
            </h2>
            <p>
              Your beginner conditioning routine, guided from the first rep to
              the final set.
            </p>
          </div>
          <ActionLink href={`/programs/${conditioningProgram.id}`}>
            Start training
            <Icon size={17} />
          </ActionLink>
        </div>
        <div className="hero-side">
          <div className="card hero-mini">
            <div>
              <p>Completed workouts</p>
              <strong>{app.ready ? stats.completed : "—"}</strong>
              <p className="small">All prescribed sets recorded</p>
            </div>
            <span className="mini-icon">
              <Icon name="check" />
            </span>
          </div>
          <div className="card hero-mini">
            <div>
              <p>This week</p>
              <strong>
                {app.ready ? stats.thisWeek : "—"}
                <span
                  style={{
                    fontSize: 16,
                    color: "var(--muted)",
                    fontWeight: 400,
                  }}
                >
                  {" "}
                  / ~3
                </span>
              </strong>
              <p className="small">A recovery day between sessions</p>
            </div>
            <span className="mini-icon">
              <Icon name="calendar" />
            </span>
          </div>
        </div>
      </section>
      <section>
        <div className="section-head">
          <h2>Your programs</h2>
          <small>Train with intention</small>
        </div>
        <div className="program-grid">
          {programs.map((p, i) => (
            <article
              key={p.id}
              className={`card program-card ${p.availability === "active" ? "available" : "coming"}`}
            >
              <div className="program-top">
                <span className="program-icon">
                  <Icon
                    name={i === 0 ? "run" : i === 1 ? "pull" : "plus"}
                    size={25}
                  />
                </span>
                <Badge tone={i === 0 ? "mint" : "muted"}>
                  {i === 0 ? "Active" : "Coming soon"}
                </Badge>
              </div>
              <h3>{p.name}</h3>
              <p>
                {i === 0
                  ? "Build strength and resilience before your running journey. Six movements. A solid foundation."
                  : p.description}
              </p>
              <div className="program-footer">
                <span>
                  {i === 0 ? "6 exercises · 18 sets" : "A new chapter, ahead"}
                </span>
                {i === 0 ? (
                  <Link className="text-link" href={`/programs/${p.id}`}>
                    View program
                    <Icon size={15} />
                  </Link>
                ) : (
                  <Icon name="lock" size={14} />
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="two-col">
        <section className="card">
          <div className="section-head">
            <h2>Recent activity</h2>
            <Link className="text-link" href="/history">
              View history
              <Icon size={14} />
            </Link>
          </div>
          {recent.length ? (
            <SessionRows sessions={recent} />
          ) : (
            <Empty title="Your first session starts a story" icon="history">
              Once you save a workout, you’ll find it here. Every honest rep
              counts.
            </Empty>
          )}
        </section>
        <section className="card">
          <div className="section-head">
            <h2>Your consistency</h2>
            <Icon name="calendar" size={18} />
          </div>
          <Calendar sessions={app.data.sessions} />
        </section>
      </div>
    </>
  );
}
