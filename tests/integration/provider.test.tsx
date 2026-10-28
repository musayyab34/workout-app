// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import { AppProvider, useApp } from "@/features/workout/provider";
import { conditioningProgram } from "@/programs/catalog";
import { correctSet } from "@/features/workout/machine";
import { closeFitnessDatabase, DATABASE_NAME } from "@/lib/storage/db";
import * as repository from "@/lib/storage/repository";

const START = Date.parse("2026-10-20T08:00:00.000Z");
beforeEach(async () => {
  await closeFitnessDatabase();
  await deleteDB(DATABASE_NAME);
  vi.spyOn(Date, "now").mockReturnValue(START);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await closeFitnessDatabase();
});
async function setup() {
  const hook = renderHook(() => useApp(), { wrapper: AppProvider });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  await act(async () => {
    expect(await hook.result.current.start(conditioningProgram, 90)).toBe(true);
  });
  return hook;
}

describe("durable workout controller", () => {
  it("keeps submit available while blur input autosaves, then serializes confirmation", async () => {
    const { result } = await setup();
    const originalSave = repository.saveDraft;
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi
      .spyOn(repository, "saveDraft")
      .mockImplementationOnce(async (...args) => {
        await blocked;
        return originalSave(...args);
      });
    act(() => {
      result.current.setInput("13");
    });
    let flush: Promise<void>;
    act(() => {
      flush = result.current.flushInput();
    });
    await waitFor(() => expect(spy).toHaveBeenCalledOnce());
    expect(result.current.busy).toBe(false);
    const setId = result.current.data.draft!.currentSetId!;
    let confirming: Promise<boolean>;
    act(() => {
      confirming = result.current.command({
        type: "confirm",
        setId,
        value: "13",
      });
    });
    expect(result.current.busy).toBe(true);
    await act(async () => {
      release();
      await flush!;
      expect(await confirming!).toBe(true);
    });
    expect(result.current.data.draft?.sets[0].actualReps).toBe(13);
    expect(result.current.data.draft?.phase).toBe("resting");
  });
  it("flushes the latest typed value and leaves actual results blank until confirmation", async () => {
    const { result } = await setup();
    act(() => {
      result.current.setInput("1");
      result.current.setInput("13");
    });
    await act(async () => {
      await result.current.flushInput();
    });
    expect(result.current.data.draft?.input).toBe("13");
    expect(result.current.data.draft?.sets[0].actualReps).toBeNull();
    const id = result.current.data.draft!.currentSetId!;
    await act(async () => {
      await result.current.command({ type: "confirm", setId: id, value: "13" });
    });
    expect(result.current.data.draft?.sets[0].actualReps).toBe(13);
    expect(result.current.data.draft?.sets[1].actualReps).toBeNull();
    expect(result.current.input).toBe("");
  });
  it("rejects export preparation when the latest input cannot persist, then supports retry", async () => {
    const { result } = await setup();
    act(() => {
      result.current.setInput("13");
    });
    vi.spyOn(repository, "saveDraft").mockRejectedValueOnce(
      new Error("Storage write failed"),
    );
    await act(async () => {
      await expect(result.current.flushInput()).rejects.toThrow(
        "latest repetition input could not be saved",
      );
    });
    expect(result.current.input).toBe("13");
    expect(result.current.data.draft?.input).toBe("");
    await act(async () => {
      await result.current.flushInput();
    });
    expect(result.current.data.draft?.input).toBe("13");
  });
  it("invalidates a debounced write queued behind another operation when confirmation arrives", async () => {
    const { result } = await setup();
    let release: () => void = () => undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pending: Promise<boolean>;
    act(() => {
      pending = result.current.mutate(async (current) => {
        await blocked;
        return current;
      });
      result.current.setInput("1");
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 330));
    });
    act(() => {
      result.current.setInput("13");
    });
    const setId = result.current.data.draft!.currentSetId!;
    let confirmed: Promise<boolean>;
    act(() => {
      confirmed = result.current.command({
        type: "confirm",
        setId,
        value: "13",
      });
      release();
    });
    await act(async () => {
      await pending!;
      expect(await confirmed!).toBe(true);
      await result.current.flushInput();
    });
    expect(result.current.data.draft?.phase).toBe("resting");
    expect(result.current.data.draft?.sets[0].actualReps).toBe(13);
    expect(result.current.data.draft?.input).toBe("");
  });
  it("preserves the command timestamp and actual input when a failed confirmation is retried", async () => {
    const { result } = await setup();
    const save = vi
      .spyOn(repository, "saveDraft")
      .mockRejectedValueOnce(
        new DOMException(
          "Storage temporarily unavailable",
          "QuotaExceededError",
        ),
      );
    vi.mocked(Date.now).mockReturnValue(START + 10000);
    const setId = result.current.data.draft!.currentSetId!;
    await act(async () => {
      expect(
        await result.current.command({ type: "confirm", setId, value: "13" }),
      ).toBe(false);
    });
    expect(result.current.data.draft?.phase).toBe("performing");
    expect(result.current.error).toContain("temporarily unavailable");
    vi.mocked(Date.now).mockReturnValue(START + 60000);
    act(() => {
      result.current.retry();
    });
    await waitFor(() =>
      expect(result.current.data.draft?.phase).toBe("resting"),
    );
    expect(result.current.data.draft?.sets[0].recordedAt).toBe(
      new Date(START + 10000).toISOString(),
    );
    expect(result.current.data.draft?.rest?.deadlineAt).toBe(START + 100000);
    expect(save).toHaveBeenCalledTimes(2);
  });
  it("coalesces concurrent Save requests into one history entry", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.command({ type: "end" });
    });
    await act(async () => {
      const first = result.current.save();
      const second = result.current.save();
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    });
    expect(result.current.data.sessions).toHaveLength(1);
    expect(result.current.data.draft).toBeNull();
    expect(result.current.error).toBeNull();
  });
  it("rejects a stale local correction instead of overwriting a newer correction", async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.command({ type: "end" });
      await result.current.save();
    });
    const original = result.current.data.sessions[0];
    const setId = original.sets[0].id;
    const first = correctSet(
      original,
      setId,
      "recorded",
      13,
      undefined,
      START + 10000,
    );
    const stale = correctSet(
      original,
      setId,
      "recorded",
      5,
      undefined,
      START + 20000,
    );
    await act(async () => {
      expect(await result.current.editRecord(first)).toBe(true);
    });
    await act(async () => {
      expect(await result.current.editRecord(stale)).toBe(false);
    });
    expect(result.current.data.sessions[0].sets[0].actualReps).toBe(13);
    expect(result.current.error).toContain("changed while you were editing");
  });
  it("reloads after a cross-tab conflict without replaying a stale command", async () => {
    const { result } = await setup();
    const outside = await repository.loadDataset();
    await repository.updatePreferences(outside.revision, {
      ...outside.preferences,
      defaultRestSeconds: 45,
    });
    const setId = result.current.data.draft!.currentSetId!;
    await act(async () => {
      expect(
        await result.current.command({ type: "confirm", setId, value: "20" }),
      ).toBe(false);
    });
    expect(result.current.data.preferences.defaultRestSeconds).toBe(45);
    expect(result.current.data.draft?.sets[0].actualReps).toBeNull();
    expect(result.current.notice).toContain("Another tab");
  });
});
