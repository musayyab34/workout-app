import { z } from "zod";
import { programSchema, templateSchema, type Program } from "./schemas";
import { programs, conditioningProgram } from "@/programs/catalog";
export const personalProgramSchema = z
  .object({
    kind: z.enum(["bundled-override", "custom"]),
    archived: z.boolean(),
    definition: programSchema.extend({
      templates: z
        .array(
          templateSchema.extend({
            defaultRestSeconds: z.number().int().min(0).max(900).nullable(),
          }),
        )
        .length(1),
    }),
  })
  .strict()
  .superRefine((p, ctx) => {
    const d = p.definition,
      es = d.templates[0].exercises;
    if (
      d.availability !== "active" ||
      (p.kind === "bundled-override" && d.id !== "beginner-conditioning") ||
      (p.kind === "custom" && programs.some((x) => x.id === d.id))
    )
      ctx.addIssue({ code: "custom", message: "Invalid program identity" });
    if (d.referenceUrl) {
      let u: URL;
      try {
        u = new URL(d.referenceUrl);
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid reference URL" });
        return;
      }
      if (u.username || u.password)
        ctx.addIssue({
          code: "custom",
          message: "Reference URLs cannot contain credentials",
        });
    }
    const ids = es.map((e) => e.id),
      sets = es.flatMap((e) => e.sets.map((s) => s.id));
    if (
      new Set(ids).size !== ids.length ||
      new Set(sets).size !== sets.length ||
      es.some((e) => e.sets.some((s, i) => s.setNumber !== i + 1))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Exercise and set identities/order must be unique and sequential",
      });
  });
export type PersonalProgram = z.infer<typeof personalProgramSchema>;
export function resolvedPrograms(personal: PersonalProgram[] = []): Program[] {
  const resolved = personal
    .filter((p) => !p.archived)
    .map((p) => ({
      ...p.definition,
      templates: p.definition.templates.map((t) => ({
        ...t,
        defaultRestSeconds: t.defaultRestSeconds ?? 90,
      })),
    }));
  return [
    ...programs.flatMap((p) =>
      personal.some((x) => x.definition.id === p.id)
        ? resolved.filter((x) => x.id === p.id)
        : [p],
    ),
    ...resolved.filter((p) => !programs.some((x) => x.id === p.id)),
  ];
}
export function newProgram(): PersonalProgram {
  const id = crypto.randomUUID();
  return {
    kind: "custom",
    archived: false,
    definition: {
      id,
      slug: id,
      version: 1,
      name: "My program",
      description: "",
      availability: "active",
      guidance: [],
      referenceUrl: null,
      templates: [
        {
          id: crypto.randomUUID(),
          version: 1,
          name: "My routine",
          defaultRestSeconds: null,
          exercises: [],
        },
      ],
    },
  };
}
export function editableProgram(
  id: string,
  personal: PersonalProgram[],
): PersonalProgram | undefined {
  return (
    personal.find((p) => p.definition.id === id) ??
    (id === conditioningProgram.id
      ? {
          kind: "bundled-override",
          archived: false,
          definition: {
            ...structuredClone(conditioningProgram),
            templates: conditioningProgram.templates.map((t) => ({
              ...structuredClone(t),
              defaultRestSeconds: null,
            })),
          },
        }
      : undefined)
  );
}
export function validateAuthoring(p: PersonalProgram) {
  personalProgramSchema.parse(p);
  const es = p.definition.templates[0].exercises;
  if (
    es.length > 50 ||
    es.some((e) => e.sets.length > 50) ||
    es.reduce((n, e) => n + e.sets.length, 0) > 250 ||
    p.definition.guidance.length > 20
  )
    throw new Error(
      "Use at most 50 exercises, 50 sets per exercise, 250 total sets and 20 guidance items.",
    );
  if (
    !p.definition.name.trim() ||
    !p.definition.templates[0].name.trim() ||
    es.some(
      (e) =>
        !e.name.trim() ||
        e.sets.some(
          (s) => s.target.type !== "fixed" && !s.target.instruction.trim(),
        ),
    )
  )
    throw new Error("Names and qualitative instructions cannot be blank.");
}
