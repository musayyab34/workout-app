"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { conditioningProgram, targetLabel } from "@/programs/catalog";
import { saveProgram } from "@/lib/storage/repository";
import { editableProgram } from "@/domain/programs";
import { useApp } from "@/features/workout/provider";
import { resolvedPrograms, personalProgramSchema } from "@/domain/programs";
import { ProgramScreen } from "./program-screen";
import Link from "next/link";
export function ProgramResolver({ id }: { id: string }) {
  const app = useApp(),
    router = useRouter();
  const [original, setOriginal] = useState(false);
  if (!app.ready) return <p>Loading program…</p>;
  const personal = (app.data.programs ?? []).map((p) =>
    personalProgramSchema.parse(p),
  );
  const p = resolvedPrograms(personal).find(
    (p) => p.id === id || p.slug === id,
  );
  if (!p)
    return (
      <div>
        <h1>Program unavailable</h1>
        <p>It may be archived or belong to another workspace.</p>
        <Link href="/">All programs</Link>
        <Link href={"/programs/" + id + "/edit"}>Edit / unarchive</Link>
      </div>
    );
  return (
    <>
      <div className="row wrap">
        {p.availability === "active" && (
          <Link className="text-link" href={"/programs/" + p.id + "/edit"}>
            Edit program
          </Link>
        )}
        {personal.some((x) => x.definition.id === id) && (
          <span>Personalized · version {p.version}</span>
        )}
      </div>
      {p.availability === "active" && (
        <div className="row wrap">
          <button
            onClick={async () => {
              const source = editableProgram(id, personal);
              if (!source) return;
              const copy = structuredClone(source);
              copy.kind = "custom";
              copy.archived = false;
              copy.definition.id = crypto.randomUUID();
              copy.definition.slug = copy.definition.id;
              copy.definition.name += " copy";
              copy.definition.version = 1;
              copy.definition.templates[0].id = crypto.randomUUID();
              copy.definition.templates[0].version = 1;
              copy.definition.templates[0].exercises.forEach((e) => {
                e.id = crypto.randomUUID();
                e.sets.forEach((s) => (s.id = crypto.randomUUID()));
              });
              if (await app.mutate((d) => saveProgram(d.revision, copy)))
                router.push("/programs/" + copy.definition.id + "/edit");
            }}
          >
            Duplicate program
          </button>
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Archive this program? Your history and current workout remain available.",
                )
              )
                return;
              const doc = editableProgram(id, personal);
              if (doc)
                await app.mutate((d) =>
                  saveProgram(d.revision, { ...doc, archived: true }),
                );
            }}
          >
            Archive program
          </button>
          {id === "beginner-conditioning" && (
            <>
              <button onClick={() => setOriginal(!original)}>
                View original
              </button>
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      "Restore the original mentor routine for future workouts?",
                    )
                  )
                    return;
                  const doc = editableProgram(id, []);
                  if (doc) {
                    doc.definition.version = p.version + 1;
                    doc.definition.templates[0].version =
                      p.templates[0].version + 1;
                    await app.mutate((d) => saveProgram(d.revision, doc));
                  }
                }}
              >
                Restore original
              </button>
            </>
          )}
        </div>
      )}
      {original ? (
        <section className="card">
          <h2>Original mentor prescription</h2>
          {conditioningProgram.templates[0].exercises.map((e) => (
            <p key={e.id}>
              <strong>{e.name}</strong> · {e.sets.length} sets ·{" "}
              {targetLabel(e.sets[0].target)}
              <br />
              {e.instructions}
            </p>
          ))}
          {conditioningProgram.guidance.map((g) => (
            <p key={g}>{g}</p>
          ))}
        </section>
      ) : (
        <ProgramScreen program={p} />
      )}
    </>
  );
}
