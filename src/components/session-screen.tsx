"use client";
import Link from "next/link";
import { useApp } from "@/features/workout/provider";
import { SessionDetail } from "./session-detail";
import { ActionLink, Empty } from "./ui";
export function SessionScreen({ id }: { id: string }) {
  const app = useApp();
  if (!app.ready) return null;
  const session = app.data.sessions.find((s) => s.id === id);
  if (!session)
    return (
      <Empty
        title="This session isn’t on this browser"
        icon="history"
        action={<ActionLink href="/history">View history</ActionLink>}
      >
        Workouts are stored locally. If this came from another browser or
        device, import its backup in Settings.
      </Empty>
    );
  return (
    <>
      <Link href="/history" className="back-link">
        ‹ Workout history
      </Link>
      <SessionDetail key={session.id} record={session} />
    </>
  );
}
