import type { Program, Target } from "@/domain/schemas";
import { conditioningProgram } from "./beginner-conditioning";

export { conditioningProgram, mentorGuidance } from "./beginner-conditioning";
export const programs: Program[] = [
  conditioningProgram,
  {
    id: "pull-up-progression",
    slug: "pull-up-progression",
    version: 1,
    name: "Pull-Up Progression",
    description:
      "Your next strength chapter. A dedicated progression, coming when you are ready.",
    availability: "coming-soon",
    templates: [],
    guidance: [],
    referenceUrl: null,
  },
  {
    id: "future-training",
    slug: "future-training",
    version: 1,
    name: "Future Training Program",
    description: "Space for your next goal. Your training can grow with you.",
    availability: "coming-soon",
    templates: [],
    guidance: [],
    referenceUrl: null,
  },
];
export function getProgram(id: string): Program | undefined {
  return programs.find((p) => p.id === id || p.slug === id);
}
export function targetLabel(target: Target): string {
  return target.type === "fixed"
    ? `${target.reps} reps`
    : target.type === "submaximal"
      ? "Submaximal"
      : "Until muscular burning";
}
