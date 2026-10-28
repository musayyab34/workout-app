// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDataset } from "@/domain/schemas";
import { createDraft, transition } from "@/features/workout/machine";
import { conditioningProgram } from "@/programs/catalog";
import { useApp } from "@/features/workout/provider";
import Workout from "@/app/workout/page";

const shared = vi.hoisted(() => ({
  value: null as unknown,
  push: vi.fn(),
  replace: vi.fn(),
  alert: vi.fn(),
}));
vi.mock("@/features/workout/provider", () => ({ useApp: () => shared.value }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: shared.push, replace: shared.replace }),
}));
vi.mock("@/features/workout/alerts", () => ({ playAlert: shared.alert }));
type App = ReturnType<typeof useApp>;
let app: App;
const now = Date.parse("2026-10-29T12:00:00.000Z");
beforeEach(() => {
  vi.useFakeTimers({ now });
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  const data = emptyDataset();
  data.draft = createDraft(conditioningProgram, 90, now - 30000, "UTC");
  app = {
    data,
    ready: true,
    error: null,
    busy: false,
    recovered: false,
    notice: null,
    input: "",
    command: vi.fn().mockResolvedValue(true),
    start: vi.fn(),
    setInput: vi.fn(),
    flushInput: vi.fn().mockResolvedValue(undefined),
    mutate: vi.fn(),
    save: vi.fn(),
    discard: vi.fn().mockResolvedValue(true),
    editRecord: vi.fn(),
    preferences: vi.fn(),
    refresh: vi.fn(),
    retry: vi.fn(),
    clearError: vi.fn(),
    acceptRecovery: vi.fn(),
  };
  shared.value = app;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("workout screen safeguards", () => {
  it("uses a single native modal when moving from options to confirmation", () => {
    render(<Workout />);
    fireEvent.click(screen.getByRole("button", { name: "Workout options" }));
    const options = screen.getByRole("dialog", { name: "Workout options" });
    fireEvent.click(
      within(options).getByRole("button", { name: "End workout" }),
    );
    const confirmation = screen.getByRole("dialog", {
      name: "End this workout?",
    });
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
    fireEvent.click(
      within(confirmation).getByRole("button", { name: "Keep training" }),
    );
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(0);
  });
  it("keeps invalid rest feedback inside the modal and does not persist it", () => {
    render(<Workout />);
    fireEvent.click(screen.getByRole("button", { name: "Workout options" }));
    const dialog = screen.getByRole("dialog", { name: "Workout options" });
    fireEvent.change(
      within(dialog).getByRole("textbox", {
        name: "Future rests in this session (seconds)",
      }),
      { target: { value: "901" } },
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Update future rests" }),
    );
    expect(within(dialog).getByRole("alert").textContent).toContain("0 to 900");
    expect(app.command).not.toHaveBeenCalled();
  });
  it("settles an expired rest once while a save is pending without replaying an arrival alert", async () => {
    const initial = app.data.draft!;
    app.data.draft = transition(
      initial,
      { type: "confirm", setId: initial.currentSetId!, value: "10" },
      now - 20000,
    );
    app.data.draft.rest!.deadlineAt = now - 500;
    let finish: ((value: boolean) => void) | undefined;
    vi.mocked(app.command).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<Workout />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(app.command).toHaveBeenCalledTimes(1);
    app = {
      ...app,
      data: {
        ...app.data,
        draft: transition(app.data.draft!, { type: "tick" }, now),
      },
    };
    shared.value = app;
    await act(async () => {
      finish!(true);
    });
    view.rerender(<Workout />);
    expect(shared.alert).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start next set" })).toBeTruthy();
  });
  it("does not navigate away when flushing typed repetitions fails", async () => {
    vi.mocked(app.flushInput).mockRejectedValueOnce(
      new Error("Storage unavailable"),
    );
    render(<Workout />);
    fireEvent.click(screen.getByRole("button", { name: "Workout options" }));
    const options = screen.getByRole("dialog", { name: "Workout options" });
    fireEvent.click(
      within(options).getByRole("button", { name: "Pause and leave" }),
    );
    const confirmation = screen.getByRole("dialog", {
      name: "Pause and leave?",
    });
    await act(async () => {
      fireEvent.click(
        within(confirmation).getByRole("button", { name: "Pause and leave" }),
      );
    });
    expect(shared.push).not.toHaveBeenCalled();
    expect(app.command).not.toHaveBeenCalled();
    expect(document.querySelectorAll("dialog[open]")).toHaveLength(0);
  });
});
