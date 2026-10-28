"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Program } from "@/domain/schemas";
import { useApp } from "@/features/workout/provider";
import { targetLabel } from "@/programs/catalog";
import { recoveryActivity, summarize } from "@/features/statistics";
import {
  Badge,
  Button,
  Dialog,
  Icon,
  PageHeading,
  ActionLink,
  ErrorText,
} from "./ui";
export function ProgramScreen({ program }: { program: Program }) {
  const app = useApp(),
    router = useRouter();
  const [rest, setRest] = useState<string | null>(null),
    [warning, setWarning] = useState(false),
    [invalid, setInvalid] = useState(""),
    [checkTime, setCheckTime] = useState(() => Date.now());
  const recovery = recoveryActivity(
    app.data.sessions,
    app.data.draft,
    checkTime,
    program.id,
  );
  const seconds = rest ?? String(app.data.preferences.defaultRestSeconds);
  const stats = summarize(app.data.sessions, { programId: program.id });
  const begin = async () => {
    setInvalid("");
    if (!/^\d+$/.test(seconds) || Number(seconds) > 900) {
      setInvalid("Enter a whole rest duration from 0 to 900 seconds.");
      return;
    }
    if (await app.start(program, Number(seconds))) router.push("/workout");
  };
  return (
    <>
      <Link className="back-link" href="/">
        ‹ All programs
      </Link>
      <PageHeading eyebrow="Your foundation program" title={program.name}>
        {program.description}
      </PageHeading>
      {program.availability !== "active" ? (
        <div className="card">
          <Badge>Coming soon</Badge>
          <p style={{ marginTop: 16 }}>
            No workouts have been defined for this program yet.
          </p>
        </div>
      ) : (
        <div className="two-col">
          <section className="card">
            <div className="section-head">
              <h2>The routine</h2>
              <Badge tone="mint">6 exercises · 18 sets</Badge>
            </div>
            {program.templates[0].exercises.map((ex, i) => (
              <div className="exercise-row" key={ex.id}>
                <span className="exercise-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{ex.name}</h3>
                  <div className="prescription">
                    {ex.sets.length} sets · {targetLabel(ex.sets[0].target)}
                  </div>
                  <p>{ex.instructions}</p>
                </div>
              </div>
            ))}
          </section>
          <aside className="stack">
            <div className="card">
              <p className="eyebrow">Ready when you are</p>
              <h2>Make today count.</h2>
              <p className="small" style={{ margin: "12px 0 24px" }}>
                Go at your pace. Record what you actually do, even when it’s
                below the target.
              </p>
              <label className="field">
                <span>Rest between sets & exercises (seconds)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={seconds}
                  onChange={(e) => setRest(e.target.value)}
                  maxLength={3}
                />
              </label>
              <p className="small" style={{ margin: "8px 0 20px" }}>
                App default: 90 seconds. Your mentor did not prescribe an exact
                rest duration.
              </p>
              {invalid && <ErrorText>{invalid}</ErrorText>}
              {app.data.draft ? (
                <ActionLink
                  href={
                    app.data.draft.phase === "review"
                      ? "/workout/summary"
                      : "/workout"
                  }
                >
                  Resume existing workout
                  <Icon />
                </ActionLink>
              ) : (
                <Button
                  className="full"
                  disabled={!app.ready || app.busy || !!app.error}
                  onClick={() => {
                    const now = Date.now();
                    setCheckTime(now);
                    if (
                      recoveryActivity(
                        app.data.sessions,
                        app.data.draft,
                        now,
                        program.id,
                      ).warning
                    )
                      setWarning(true);
                    else void begin();
                  }}
                >
                  Start Workout
                  <Icon name="play" size={16} />
                </Button>
              )}
              <div
                className="row between small"
                style={{ marginTop: 20, color: "var(--muted)" }}
              >
                <span>{stats.completed} all sets recorded</span>
                <span>{stats.partial} partial</span>
              </div>
            </div>
            <div className="card">
              <div className="row">
                <Icon name="info" size={18} />
                <h3>Train. Recover. Repeat.</h3>
              </div>
              <ul className="guidance">
                {program.guidance.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              {program.referenceUrl && (
                <a
                  className="text-link"
                  href={program.referenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Reference demonstration ↗
                </a>
              )}
            </div>
          </aside>
        </div>
      )}
      <Dialog
        open={warning}
        title="Leave room for recovery"
        onClose={() => setWarning(false)}
      >
        <p>{recovery.message}</p>
        <p>
          Rest is part of the plan. Continue only to record a workout that you
          choose to perform.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => setWarning(false)}>
            Return to program
          </Button>
          <Button
            onClick={() => {
              setWarning(false);
              void begin();
            }}
          >
            Continue to record a workout
          </Button>
        </div>
      </Dialog>
    </>
  );
}
