import type { Draft, Rest } from "@/domain/schemas";

export function remainingRest(rest: Rest | null, now: number): number {
  if (!rest || rest.status === "ready") return 0;
  return rest.status === "running"
    ? Math.max(0, (rest.deadlineAt ?? now) - now)
    : rest.remainingMs;
}
export function elapsedDuration(draft: Draft, now: number): number {
  const end = draft.endedAt ? Date.parse(draft.endedAt) : now;
  const openPause = draft.pause
    ? Math.max(0, end - Date.parse(draft.pause.startedAt))
    : 0;
  return (
    end - Date.parse(draft.startedAt) - draft.accumulatedPausedMs - openPause
  );
}
export function countdownSeconds(rest: Rest | null, now: number): number {
  return Math.ceil(remainingRest(rest, now) / 1000);
}
