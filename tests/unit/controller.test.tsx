// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset, Draft, Preferences, Session } from "@/domain/schemas";
import { emptyDataset } from "@/domain/schemas";
import { conditioningProgram } from "@/programs/catalog";
import { createDraft } from "@/features/workout/machine";
import { AppProvider, useApp } from "@/features/workout/provider";

const mocked = vi.hoisted(() => ({
  loadDataset: vi.fn(),
  saveDraft: vi.fn(),
  finalizeSession: vi.fn(),
  updateSession: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock("@/lib/storage/repository", () => ({
  ...mocked,
  StaleRevisionError: class StaleRevisionError extends Error {},
}));
const time = Date.parse("2026-10-29T12:00:00.000Z");
let stored: Dataset;
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(AppProvider, null, children);
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(time + 1000);
  stored = emptyDataset();
  stored.draft = createDraft(conditioningProgram, 90, time, "UTC");
  mocked.loadDataset.mockImplementation(async () => structuredClone(stored));
  mocked.saveDraft.mockImplementation(
    async (revision: number, draft: Draft | null) => {
      if (revision !== stored.revision)
        throw new Error("Unexpected stale revision in test");
      stored = { ...stored, draft, revision: revision + 1 };
      return structuredClone(stored);
    },
  );
  mocked.updateSession.mockImplementation(
    async (revision: number, session: Session) => ({
      ...stored,
      revision: revision + 1,
      sessions: [session],
    }),
  );
  mocked.updatePreferences.mockImplementation(
    async (revision: number, preferences: Preferences) => ({
      ...stored,
      revision: revision + 1,
      preferences,
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("durable workout controller", () => {
  it("invalidates debounced typing when the set is confirmed", async () => {
    const { result } = renderHook(useApp, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const setId = result.current.data.draft!.currentSetId!;
    act(() => result.current.setInput("13"));
    await act(async () => {
      expect(
        await result.current.command({ type: "confirm", setId, value: "13" }),
      ).toBe(true);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(result.current.data.draft?.sets[0].actualReps).toBe(13);
    expect(result.current.data.draft?.phase).toBe("resting");
    expect(result.current.input).toBe("");
    expect(mocked.saveDraft).toHaveBeenCalledTimes(1);
  });
  it("serializes a confirmation behind an input write already in flight", async () => {
    const { result } = renderHook(useApp, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const setId = result.current.data.draft!.currentSetId!;
    const ordinarySave = mocked.saveDraft.getMockImplementation()!;
    let release: (() => void) | undefined;
    mocked.saveDraft.mockImplementationOnce(
      (revision: number, draft: Draft | null) =>
        new Promise((resolve) => {
          release = () => {
            resolve(ordinarySave(revision, draft));
          };
        }),
    );
    act(() => result.current.setInput("13"));
    await waitFor(() => expect(mocked.saveDraft).toHaveBeenCalledTimes(1));
    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.command({ type: "confirm", setId, value: "13" });
    });
    expect(result.current.data.draft?.sets[0].status).toBe("pending");
    await act(async () => {
      release!();
      expect(await pending!).toBe(true);
    });
    expect(result.current.data.draft?.sets[0]).toMatchObject({
      status: "recorded",
      actualReps: 13,
    });
    expect(result.current.data.draft?.phase).toBe("resting");
    expect(result.current.input).toBe("");
  });
  it("retains committed state on failure and retries with the original action time", async () => {
    const program = structuredClone(conditioningProgram);
    program.templates[0].exercises = [program.templates[0].exercises[0]];
    program.templates[0].exercises[0].sets = [
      program.templates[0].exercises[0].sets[0],
    ];
    stored.draft = createDraft(program, 90, time, "UTC");
    vi.spyOn(Date, "now").mockReturnValue(time + 1000);
    const { result } = renderHook(useApp, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    mocked.saveDraft.mockRejectedValueOnce(new Error("Storage full"));
    const setId = result.current.data.draft!.currentSetId!;
    await act(async () => {
      expect(
        await result.current.command({ type: "confirm", setId, value: "13" }),
      ).toBe(false);
    });
    expect(result.current.error).toBe("Storage full");
    expect(result.current.data.draft?.sets[0].status).toBe("pending");
    vi.mocked(Date.now).mockReturnValue(time + 60000);
    act(() => result.current.retry());
    await waitFor(() =>
      expect(result.current.data.draft?.phase).toBe("review"),
    );
    expect(result.current.data.draft?.endedAt).toBe(
      new Date(time + 1000).toISOString(),
    );
    expect(result.current.data.draft?.sets[0].actualReps).toBe(13);
  });
});
