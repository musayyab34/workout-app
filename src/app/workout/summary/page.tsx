"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/features/workout/provider";
import { SessionDetail } from "@/components/session-detail";
import { ActionLink, Empty } from "@/components/ui";
export default function Summary() {
  const app = useApp(),
    router = useRouter();
  useEffect(() => {
    if (app.ready && app.data.draft && app.data.draft.phase !== "review")
      router.replace("/workout");
  }, [app.ready, app.data.draft, router]);
  if (!app.ready) return null;
  if (!app.data.draft)
    return (
      <Empty
        title="Your session is in history"
        action={<ActionLink href="/history">View history</ActionLink>}
      >
        There is no unfinished workout awaiting review.
      </Empty>
    );
  if (app.data.draft.phase !== "review") return null;
  return <SessionDetail record={app.data.draft} review />;
}
