/* eslint-disable react-hooks/exhaustive-deps -- editor captures its base once; subsequent changes must be reviewed */
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useApp } from "@/features/workout/provider";
import {
  editableProgram,
  newProgram,
  personalProgramSchema,
  validateAuthoring,
  type PersonalProgram,
} from "@/domain/programs";
import { createDownload } from "@/lib/backup";
import { canonical } from "@/features/sync/model";
import { saveProgram } from "@/lib/storage/repository";
import { openFitnessDatabase } from "@/lib/storage/db";
import { conditioningProgram } from "@/programs/catalog";
import type { Target } from "@/domain/schemas";
export function ProgramEditor({ id }: { id?: string }) {
  const app = useApp(),
    router = useRouter();
  const [value, setValue] = useState<PersonalProgram | null>(null),
    [message, setMessage] = useState(""),
    [review, setReview] = useState(false);
  const base = useRef(0),
    scratch = useRef(id ?? "new");
  useEffect(() => {
    if (!app.ready) return;
    void Promise.resolve().then(() => {
      const p = id
        ? editableProgram(
            id,
            (app.data.programs ?? []).map((x) =>
              personalProgramSchema.parse(x),
            ),
          )
        : newProgram();
      if (p) {
        base.current = p.definition.version;
        setValue(structuredClone(p));
      } else setMessage("Program not found.");
      void openFitnessDatabase()
        .then((db) => db.get("metadata", "editor:" + scratch.current))
        .then((saved) => {
          if (saved && confirm("Restore your unsaved program draft?")) {
            base.current = (saved as PersonalProgram).definition.version;
            setValue(saved as PersonalProgram);
          }
        });
    });
  }, [app.ready, id]);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => {
      void openFitnessDatabase()
        .then((db) => db.put("metadata", value, "editor:" + scratch.current))
        .catch(() =>
          setMessage("Editor draft could not be saved. Keep this page open."),
        );
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);
  if (!value) return <p>{message || "Opening program…"}</p>;
  const p = value.definition,
    t = p.templates[0];
  const change = (fn: (v: PersonalProgram) => void) => {
    const next = structuredClone(value);
    fn(next);
    setValue(next);
    setReview(false);
  };
  const save = async () => {
    try {
      validateAuthoring(value);
      if (!review) {
        setReview(true);
        return;
      }
      const existing = editableProgram(
        p.id,
        (app.data.programs ?? []).map((x) => personalProgramSchema.parse(x)),
      );
      if (existing && existing.definition.version !== base.current)
        throw new Error(
          "This program changed. Copy your draft before reopening the latest version.",
        );
      if (existing && canonical(existing) === canonical(value)) {
        router.push("/programs/" + p.id);
        return;
      }
      const next = structuredClone(value);
      next.definition.version = (existing?.definition.version ?? 0) + 1;
      next.definition.templates[0].version =
        (existing?.definition.templates[0].version ?? 0) + 1;
      if (await app.mutate((d) => saveProgram(d.revision, next))) {
        await (
          await openFitnessDatabase()
        ).delete("metadata", "editor:" + scratch.current);
        router.push("/programs/" + p.id);
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const move = (i: number, delta: number) =>
    change((v) => {
      const es = v.definition.templates[0].exercises;
      const j = i + delta;
      if (j >= 0 && j < es.length) [es[i], es[j]] = [es[j], es[i]];
    });
  return (
    <div className="stack editor">
      <Link href="/">‹ Programs</Link>
      <h1>{id ? "Edit program" : "Create program"}</h1>
      <p>
        Changes apply to future workouts. History and your current workout keep
        their original prescription.
      </p>
      <section className="card stack">
        <label className="field">
          Program name
          <input
            maxLength={200}
            value={p.name}
            onChange={(e) =>
              change((v) => {
                v.definition.name = e.target.value;
              })
            }
          />
        </label>
        <label className="field">
          Description / notes
          <textarea
            maxLength={4000}
            value={p.description}
            onChange={(e) =>
              change((v) => {
                v.definition.description = e.target.value;
              })
            }
          />
        </label>
        <label className="field">
          Guidance (one item per line)
          <textarea
            value={p.guidance.join("\n")}
            onChange={(e) =>
              change((v) => {
                v.definition.guidance = e.target.value.split("\n");
              })
            }
          />
        </label>
        <label className="field">
          Reference URL
          <input
            type="url"
            maxLength={2048}
            value={p.referenceUrl ?? ""}
            onChange={(e) =>
              change((v) => {
                v.definition.referenceUrl = e.target.value || null;
              })
            }
          />
        </label>
        <label className="field">
          Routine name
          <input
            value={t.name}
            onChange={(e) =>
              change((v) => {
                v.definition.templates[0].name = e.target.value;
              })
            }
          />
        </label>
        <label className="field">
          Default rest seconds (blank inherits account preference)
          <input
            inputMode="numeric"
            value={t.defaultRestSeconds ?? ""}
            onChange={(e) =>
              change((v) => {
                v.definition.templates[0].defaultRestSeconds =
                  e.target.value === "" ? null : Number(e.target.value);
              })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={value.archived}
            onChange={(e) =>
              change((v) => {
                v.archived = e.target.checked;
              })
            }
          />{" "}
          Archived — hide from workout start choices
        </label>
      </section>
      {t.exercises.map((ex, i) => (
        <section className="card stack" key={ex.id}>
          <div className="row wrap">
            <h2>Exercise {i + 1}</h2>
            <button onClick={() => move(i, -1)} disabled={i === 0}>
              Move up
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === t.exercises.length - 1}
            >
              Move down
            </button>
            <button
              onClick={() => {
                if (confirm("Remove this exercise from future workouts?"))
                  change((v) => {
                    v.definition.templates[0].exercises.splice(i, 1);
                  });
              }}
            >
              Remove exercise
            </button>
          </div>
          <label className="field">
            Exercise name
            <input
              maxLength={200}
              value={ex.name}
              onChange={(e) =>
                change((v) => {
                  v.definition.templates[0].exercises[i].name = e.target.value;
                })
              }
            />
          </label>
          <label className="field">
            Instructions / notes
            <textarea
              maxLength={4000}
              value={ex.instructions}
              onChange={(e) =>
                change((v) => {
                  v.definition.templates[0].exercises[i].instructions =
                    e.target.value;
                })
              }
            />
          </label>
          <button
            onClick={() => {
              if (
                confirm(
                  "This is a different movement variation. Start a separate progress series?",
                )
              )
                change((v) => {
                  v.definition.templates[0].exercises[i].exerciseId =
                    crypto.randomUUID();
                });
            }}
          >
            New movement / variant
          </button>
          {ex.sets.map((set, j) => (
            <div className="set-editor" key={set.id}>
              <strong>Set {j + 1}</strong>
              <label className="field">
                Target type
                <select
                  value={set.target.type}
                  onChange={(e) =>
                    change((v) => {
                      v.definition.templates[0].exercises[i].sets[j].target =
                        e.target.value === "fixed"
                          ? { type: "fixed", reps: 20 }
                          : {
                              type: e.target.value as "submaximal" | "burning",
                              instruction:
                                e.target.value === "submaximal"
                                  ? "Stop before muscular failure."
                                  : "Until muscular burning; avoid pain and complete failure.",
                            };
                    })
                  }
                >
                  <option value="fixed">Fixed repetitions</option>
                  <option value="submaximal">Submaximal</option>
                  <option value="burning">Until muscular burning</option>
                </select>
              </label>
              {set.target.type === "fixed" ? (
                <label className="field">
                  Target repetitions
                  <input
                    inputMode="numeric"
                    value={set.target.reps}
                    onChange={(e) =>
                      change((v) => {
                        v.definition.templates[0].exercises[i].sets[j].target =
                          { type: "fixed", reps: Number(e.target.value) };
                      })
                    }
                  />
                </label>
              ) : (
                <label className="field">
                  Target instruction
                  <input
                    maxLength={4000}
                    value={set.target.instruction}
                    onChange={(e) =>
                      change((v) => {
                        (
                          v.definition.templates[0].exercises[i].sets[j]
                            .target as Exclude<Target, { type: "fixed" }>
                        ).instruction = e.target.value;
                      })
                    }
                  />
                </label>
              )}
              <button
                onClick={() => {
                  if (confirm("Remove this set from future workouts?"))
                    change((v) => {
                      const sets = v.definition.templates[0].exercises[i].sets;
                      sets.splice(j, 1);
                      sets.forEach((s, n) => (s.setNumber = n + 1));
                    });
                }}
              >
                Remove set
              </button>
              {j > 0 && (
                <button
                  onClick={() =>
                    change((v) => {
                      const sets = v.definition.templates[0].exercises[i].sets;
                      [sets[j - 1], sets[j]] = [sets[j], sets[j - 1]];
                      sets.forEach((s, n) => (s.setNumber = n + 1));
                    })
                  }
                >
                  Move set up
                </button>
              )}
            </div>
          ))}
          <div className="row wrap">
            <button
              onClick={() =>
                change((v) => {
                  const sets = v.definition.templates[0].exercises[i].sets;
                  sets.push({
                    id: crypto.randomUUID(),
                    setNumber: sets.length + 1,
                    recordingKind: "repetitions",
                    target: structuredClone(
                      sets.at(-1)?.target ?? { type: "fixed", reps: 20 },
                    ),
                  });
                })
              }
            >
              Add set
            </button>
            <button
              onClick={() =>
                change((v) => {
                  const sets = v.definition.templates[0].exercises[i].sets;
                  sets.forEach(
                    (s) => (s.target = structuredClone(sets[0].target)),
                  );
                })
              }
            >
              Apply first target to all sets
            </button>
          </div>
        </section>
      ))}
      <section className="card stack">
        <h2>Add exercise</h2>
        <label className="field">
          Choose a known movement
          <select
            defaultValue=""
            onChange={(e) => {
              const all = [
                ...conditioningProgram.templates[0].exercises,
                ...(app.data.programs ?? []).flatMap(
                  (x) =>
                    personalProgramSchema.parse(x).definition.templates[0]
                      .exercises,
                ),
              ];
              const ex = all.find((x) => x.exerciseId === e.target.value);
              if (ex)
                change((v) => {
                  const copy = structuredClone(ex);
                  copy.id = crypto.randomUUID();
                  copy.sets.forEach((s) => (s.id = crypto.randomUUID()));
                  v.definition.templates[0].exercises.push(copy);
                });
              e.target.value = "";
            }}
          >
            <option value="">Select a movement…</option>
            {Array.from(
              new Map(
                [
                  ...conditioningProgram.templates[0].exercises,
                  ...(app.data.programs ?? []).flatMap(
                    (x) =>
                      personalProgramSchema.parse(x).definition.templates[0]
                        .exercises,
                  ),
                ].map((e) => [e.exerciseId, e]),
              ).values(),
            ).map((e) => (
              <option key={e.exerciseId} value={e.exerciseId}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() =>
            change((v) => {
              v.definition.templates[0].exercises.push({
                id: crypto.randomUUID(),
                exerciseId: crypto.randomUUID(),
                name: "New exercise",
                instructions: "",
                sets: [
                  {
                    id: crypto.randomUUID(),
                    setNumber: 1,
                    recordingKind: "repetitions",
                    target: { type: "fixed", reps: 20 },
                  },
                ],
              });
            })
          }
        >
          Create new movement
        </button>
      </section>
      {review && (
        <section className="notice">
          <div>
            <h2>Review future routine</h2>
            <p>
              {p.name} · {t.exercises.length} exercises ·{" "}
              {t.exercises.reduce((n, e) => n + e.sets.length, 0)} sets
            </p>
            <ol>
              {t.exercises.map((e) => (
                <li key={e.id}>
                  {e.name}:{" "}
                  {e.sets
                    .map((s) =>
                      s.target.type === "fixed"
                        ? s.target.reps + " reps"
                        : s.target.type,
                    )
                    .join(" / ")}
                </li>
              ))}
            </ol>
            <p>
              Existing sessions and unfinished workouts will keep their original
              prescription.
            </p>
          </div>
        </section>
      )}
      <button
        className="button secondary"
        onClick={() => {
          const file = createDownload(
            JSON.stringify(value, null, 2),
            "workout-program-draft.json",
          );
          setTimeout(file.release, 60000);
        }}
      >
        Download editor draft
      </button>
      {message && <p role="alert">{message}</p>}
      <div className="row wrap">
        <button
          className="button primary"
          onClick={() => void save()}
          disabled={app.busy}
        >
          {review ? "Confirm and save program" : "Review changes"}
        </button>
        <button
          onClick={async () => {
            if (confirm("Discard this editor draft?")) {
              await (
                await openFitnessDatabase()
              ).delete("metadata", "editor:" + scratch.current);
              router.push("/");
            }
          }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
