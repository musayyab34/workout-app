import { z } from "zod";

export const idSchema = z.string().min(1).max(120);
export const timestampSchema = z.string().datetime({ offset: true });
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Invalid calendar date");
export const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Unsupported time zone");
const duration = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().max(4000);
export const targetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("fixed"),
      reps: z.number().int().min(1).max(10000),
    })
    .strict(),
  z.object({ type: z.literal("submaximal"), instruction: text }).strict(),
  z.object({ type: z.literal("burning"), instruction: text }).strict(),
]);
export const prescriptionSchema = z
  .object({
    id: idSchema,
    setNumber: z.number().int().min(1),
    recordingKind: z.literal("repetitions"),
    target: targetSchema,
  })
  .strict();
export const exerciseSchema = z
  .object({
    id: idSchema,
    exerciseId: idSchema,
    name: z.string().min(1).max(200),
    instructions: text,
    sets: z.array(prescriptionSchema).min(1),
  })
  .strict();
export const templateSchema = z
  .object({
    id: idSchema,
    version: z.number().int().min(1),
    name: z.string().min(1).max(200),
    exercises: z.array(exerciseSchema).min(1),
    defaultRestSeconds: z.number().int().min(0).max(900),
  })
  .strict();
export const programSchema = z
  .object({
    id: idSchema,
    slug: idSchema,
    version: z.number().int().min(1),
    name: z.string().min(1).max(200),
    description: text,
    availability: z.enum(["active", "coming-soon"]),
    templates: z.array(templateSchema),
    guidance: z.array(text),
    referenceUrl: z
      .string()
      .url()
      .refine((v) => /^https?:\/\//.test(v))
      .nullable(),
  })
  .strict();
export const snapshotSchema = z
  .object({
    programId: idSchema,
    programName: z.string().min(1).max(200),
    programVersion: z.number().int().min(1),
    templateId: idSchema,
    templateVersion: z.number().int().min(1),
    exercises: z.array(exerciseSchema).min(1),
    context: z
      .object({
        programDescription: text,
        guidance: z.array(text),
        referenceUrl: z.string().url().nullable(),
        templateName: z.string(),
        source: z.enum(["bundled", "personalized", "custom"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export const setRecordSchema = z
  .object({
    id: idSchema,
    templateSetId: idSchema,
    exerciseEntryId: idSchema,
    exerciseId: idSchema,
    setNumber: z.number().int().min(1),
    target: targetSchema,
    status: z.enum(["pending", "recorded", "skipped", "not-attempted"]),
    actualReps: z.number().int().min(0).max(10000).nullable(),
    recordedAt: timestampSchema.nullable(),
    activityDate: dateKeySchema.nullable(),
    origin: z.enum(["live", "manual-correction"]),
    correctedAt: timestampSchema.nullable(),
    skipNote: z.string().max(1000).nullable(),
  })
  .strict();
export const restSchema = z
  .object({
    id: idSchema,
    sourceSetId: idSchema,
    nextSetId: idSchema,
    durationMs: duration.max(900000),
    deadlineAt: duration.nullable(),
    remainingMs: duration.max(900000),
    status: z.enum(["running", "paused", "ready"]),
    startedAt: timestampSchema,
  })
  .strict();
export const pauseSchema = z
  .object({
    startedAt: timestampSchema,
    previousPhase: z.enum(["performing", "resting", "ready"]),
    restWasRunning: z.boolean(),
  })
  .strict();
const sessionFields = {
  id: idSchema,
  revision: z.number().int().nonnegative(),
  snapshot: snapshotSchema,
  sets: z.array(setRecordSchema).min(1),
  startedAt: timestampSchema,
  startLocalDate: dateKeySchema,
  timeZone: timeZoneSchema,
  correctedDurationMs: duration.nullable(),
  durationNote: z.string().max(1000).nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};
export const draftSchema = z
  .object({
    ...sessionFields,
    phase: z.enum(["performing", "resting", "ready", "paused", "review"]),
    currentSetId: idSchema.nullable(),
    input: z.string().max(100),
    restSeconds: z.number().int().min(0).max(900),
    rest: restSchema.nullable(),
    pause: pauseSchema.nullable(),
    accumulatedPausedMs: duration,
    endedAt: timestampSchema.nullable(),
    endLocalDate: dateKeySchema.nullable(),
    endReason: z.enum(["routine-finished", "ended-early"]).nullable(),
  })
  .strict();
export const sessionSchema = z
  .object({
    ...sessionFields,
    endedAt: timestampSchema,
    endLocalDate: dateKeySchema,
    endReason: z.enum(["routine-finished", "ended-early"]),
    outcome: z.enum(["completed", "partial"]),
    calculatedDurationMs: duration,
  })
  .strict();
export const preferencesSchema = z
  .object({
    defaultRestSeconds: z.number().int().min(0).max(900),
    soundEnabled: z.boolean(),
    vibrationEnabled: z.boolean(),
  })
  .strict();
export const datasetSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    sessions: z.array(sessionSchema),
    draft: draftSchema.nullable(),
    preferences: preferencesSchema,
    programs: z.array(z.unknown()).optional(),
    recoveryCandidates: z.array(z.unknown()).optional(),
  })
  .strict();
export type Target = z.infer<typeof targetSchema>;
export type Prescription = z.infer<typeof prescriptionSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;
export type Program = z.infer<typeof programSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type SetRecord = z.infer<typeof setRecordSchema>;
export type Rest = z.infer<typeof restSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export const defaultPreferences: Preferences = {
  defaultRestSeconds: 90,
  soundEnabled: false,
  vibrationEnabled: false,
};
export function emptyDataset(): Dataset {
  return {
    revision: 0,
    sessions: [],
    draft: null,
    preferences: { ...defaultPreferences },
  };
}
