import type { Exercise, Program, Target } from "@/domain/schemas";

function exercise(
  exerciseId: string,
  name: string,
  instructions: string,
  target: Target,
): Exercise {
  return {
    id: exerciseId,
    exerciseId,
    name,
    instructions,
    sets: Array.from({ length: 3 }, (_, index) => ({
      id: `${exerciseId}-${index + 1}`,
      setNumber: index + 1,
      recordingKind: "repetitions" as const,
      target: structuredClone(target),
    })),
  };
}
export const mentorGuidance = [
  "Perform the routine approximately three times per week.",
  "Never train on two consecutive days.",
  "Leave at least one recovery day between workout sessions.",
  "Avoid muscular failure on every exercise.",
  "If the prescribed repetition count is too difficult, do fewer repetitions.",
  "Gradually increase performance over time.",
  "Prioritize good technique and consistency.",
];
export const conditioningProgram: Program = {
  id: "beginner-conditioning",
  slug: "beginner-conditioning",
  version: 1,
  name: "Beginner Running Conditioning",
  description:
    "Build a stronger foundation for the miles ahead. Six movements, eighteen sets, and room to grow.",
  availability: "active",
  guidance: mentorGuidance,
  referenceUrl: "https://youtube.com/shorts/pQcvW08rnAk",
  templates: [
    {
      id: "conditioning-foundation",
      version: 1,
      name: "Foundation routine",
      defaultRestSeconds: 90,
      exercises: [
        exercise(
          "pogo-jumps",
          "Pogo Jumps",
          "Keep jumps low and light. Focus on using the ankles rather than excessive knee bending.",
          { type: "fixed", reps: 20 },
        ),
        exercise(
          "calf-raises",
          "Calf Raises",
          "Begin with both feet on flat ground. When these become easy, discuss progression with the mentor.",
          { type: "fixed", reps: 20 },
        ),
        exercise(
          "bodyweight-squats",
          "Bodyweight Squats",
          "Start with bodyweight repetitions. Progress gradually.",
          { type: "fixed", reps: 20 },
        ),
        exercise(
          "sit-ups",
          "Sit-Ups",
          "Perform controlled repetitions and gradually build capacity.",
          { type: "fixed", reps: 20 },
        ),
        exercise(
          "push-ups",
          "Push-Ups",
          "Perform three submaximal sets, stopping before muscular failure.",
          { type: "submaximal", instruction: "Stop before muscular failure." },
        ),
        exercise(
          "tibialis-raises",
          "Tibialis Anterior Raises",
          "Perform three sets until muscular burning, without pushing into pain or complete failure. These are intended to help condition the lower legs for running.",
          {
            type: "burning",
            instruction:
              "Until muscular burning; do not push into pain or complete failure.",
          },
        ),
      ],
    },
  ],
};
