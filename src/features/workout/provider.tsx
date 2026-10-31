"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  emptyDataset,
  type Dataset,
  type Preferences,
  type Program,
  type Session,
  type Draft,
} from "@/domain/schemas";
import {
  createDraft,
  transition,
  finalizeDraft,
  type WorkoutCommand,
} from "./machine";
import * as repository from "@/lib/storage/repository";

import { workspaceGeneration } from "@/lib/storage/db";

type Operation = (data: Dataset) => Promise<Dataset>;
type Input = {
  sessionId: string;
  setId: string;
  text: string;
  generation: number;
};
interface AppContextValue {
  data: Dataset;
  ready: boolean;
  error: string | null;
  busy: boolean;
  recovered: boolean;
  notice: string | null;
  input: string;
  command: (command: WorkoutCommand) => Promise<boolean>;
  start: (program: Program, seconds: number) => Promise<boolean>;
  setInput: (value: string) => void;
  flushInput: () => Promise<void>;
  mutate: (operation: Operation) => Promise<boolean>;
  save: () => Promise<boolean>;
  discard: () => Promise<boolean>;
  editRecord: (record: Draft | Session) => Promise<boolean>;
  preferences: (prefs: Preferences) => Promise<boolean>;
  refresh: () => Promise<void>;
  retry: () => void;
  clearError: () => void;
  acceptRecovery: () => void;
}
const Context = createContext<AppContextValue | null>(null);
function messageOf(cause: unknown, fallback: string): string {
  return cause &&
    typeof cause === "object" &&
    "message" in cause &&
    typeof cause.message === "string"
    ? cause.message
    : fallback;
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset>(emptyDataset),
    [ready, setReady] = useState(false),
    [error, setError] = useState<string | null>(null),
    [pending, setPending] = useState(0),
    [recovered, setRecovered] = useState(false),
    [notice, setNotice] = useState<string | null>(null),
    [editing, setEditing] = useState<Input | null>(null);
  const workspace = useRef(workspaceGeneration);
  const dataRef = useRef(data),
    queue = useRef<Promise<unknown>>(Promise.resolve()),
    editRef = useRef<Input | null>(null),
    generation = useRef(0),
    debounce = useRef<ReturnType<typeof setTimeout> | null>(null),
    retryRef = useRef<(() => void) | null>(null),
    live = useRef(true);
  const publish = useCallback((next: Dataset) => {
    dataRef.current = next;
    if (live.current) setData(next);
  }, []);
  const mutate = useCallback(
    function enqueueMutation(
      operation: Operation,
      quiet = false,
    ): Promise<boolean> {
      // Autosaving text must not disable the submit button between blur and click.
      // It still joins the same queue and must finish before a confirmed command.
      if (!quiet) setPending((n) => n + 1);
      const task = async () => {
        try {
          if (workspace.current !== workspaceGeneration || !live.current)
            throw new Error(
              "Workspace changed; reopen this action in its original account.",
            );
          const next = await operation(dataRef.current);
          publish(next);
          setError(null);
          retryRef.current = null;
          return true;
        } catch (cause) {
          if (cause instanceof repository.StaleRevisionError) {
            try {
              publish(await repository.loadDataset());
            } catch {}
            setNotice(
              "Another tab changed your data. Review the latest saved state before trying again.",
            );
            retryRef.current = null;
          } else
            retryRef.current = () => {
              void enqueueMutation(operation, quiet);
            };
          setError(
            messageOf(
              cause,
              "Your change could not be saved. Your previous records are safe.",
            ),
          );
          return false;
        } finally {
          if (!quiet) setPending((n) => n - 1);
        }
      };
      const result = queue.current.then(task, task);
      queue.current = result;
      return result;
    },
    [publish],
  );
  const refresh = useCallback(async () => {
    const task = async () => {
      try {
        if (workspace.current !== workspaceGeneration || !live.current) return;
        const next = await repository.loadDataset();
        if (next.revision !== dataRef.current.revision) {
          publish(next);
          setNotice("The latest saved data has been loaded.");
        }
        setError(null);
        setReady(true);
      } catch (cause) {
        setError(messageOf(cause, "Local storage is unavailable."));
        setReady(true);
      }
    };
    const work = queue.current.then(task, task);
    queue.current = work;
    await work;
  }, [publish]);
  useEffect(() => {
    live.current = true;
    let canceled = false;
    void repository
      .loadDataset()
      .then((next) => {
        if (canceled) return;
        publish(next);
        setRecovered(!!next.draft && next.draft.phase !== "review");
        setReady(true);
      })
      .catch((cause) => {
        if (!canceled) {
          setError(messageOf(cause, "Local storage is unavailable."));
          setReady(true);
        }
      });
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      canceled = true;
      live.current = false;
      window.removeEventListener("focus", focus);
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [publish, refresh]);
  const persistInput = useCallback(
    (candidate: Input) =>
      mutate(async (current) => {
        if (
          candidate.generation !== generation.current ||
          current.draft?.id !== candidate.sessionId ||
          current.draft.currentSetId !== candidate.setId ||
          current.draft.phase !== "performing" ||
          current.draft.input === candidate.text
        )
          return current;
        const next = transition(current.draft, {
          type: "input",
          setId: candidate.setId,
          value: candidate.text,
        });
        return repository.saveDraft(current.revision, next);
      }, true),
    [mutate],
  );
  const setInput = useCallback(
    (text: string) => {
      const draft = dataRef.current.draft;
      if (!draft?.currentSetId || draft.phase !== "performing") return;
      generation.current++;
      const candidate = {
        sessionId: draft.id,
        setId: draft.currentSetId,
        text,
        generation: generation.current,
      };
      editRef.current = candidate;
      setEditing(candidate);
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => {
        debounce.current = null;
        void persistInput(candidate);
      }, 300);
    },
    [persistInput],
  );
  const flushInput = useCallback(async () => {
    if (debounce.current) {
      clearTimeout(debounce.current);
      debounce.current = null;
    }
    const candidate = editRef.current;
    if (candidate && !(await persistInput(candidate)))
      throw new Error(
        "Your latest repetition input could not be saved. Retry before exporting or leaving.",
      );
    await queue.current;
  }, [persistInput]);
  const command = useCallback(
    async (command: WorkoutCommand) => {
      const now = Date.now();
      const sessionId = dataRef.current.draft?.id;
      if (command.type !== "input" && command.type !== "tick") {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = null;
        generation.current++;
        if (editRef.current)
          editRef.current = {
            ...editRef.current,
            generation: generation.current,
          };
      }
      const succeeded = await mutate(async (current) => {
        if (!current.draft || current.draft.id !== sessionId)
          throw new Error(
            "This unfinished workout has changed. Reload and review it.",
          );
        let base = current.draft;
        const edit = editRef.current;
        if (
          command.type !== "confirm" &&
          edit?.sessionId === base.id &&
          edit.setId === base.currentSetId &&
          base.phase === "performing"
        )
          base = transition(
            base,
            { type: "input", setId: edit.setId, value: edit.text },
            now,
          );
        const next = transition(base, command, now);
        if (next === base) return current;
        return repository.saveDraft(current.revision, next);
      });
      if (succeeded && command.type !== "input" && command.type !== "tick") {
        editRef.current = null;
        setEditing(null);
      }
      return succeeded;
    },
    [mutate],
  );
  const start = useCallback(
    (program: Program, seconds: number) => {
      const now = Date.now();
      return mutate((current) => {
        if (current.draft)
          throw new Error("Resume or finish the existing workout first.");
        return repository.saveDraft(
          current.revision,
          (() => {
            const draft = createDraft(program, seconds, now);
            if (
              draft.snapshot.context &&
              (current.programs ?? []).some(
                (p) =>
                  (p as { definition: { id: string } }).definition.id ===
                  program.id,
              )
            )
              draft.snapshot.context.source =
                program.id === "beginner-conditioning"
                  ? "personalized"
                  : "custom";
            return draft;
          })(),
        );
      });
    },
    [mutate],
  );
  const save = useCallback(() => {
    const sessionId = dataRef.current.draft?.id;
    return mutate((current) => {
      if (!current.draft) {
        if (
          sessionId &&
          current.sessions.some((session) => session.id === sessionId)
        )
          return Promise.resolve(current);
        throw new Error(
          "This workout has already been saved. Open History to view it.",
        );
      }
      if (current.draft.id !== sessionId)
        throw new Error(
          "The unfinished workout changed. Review it before saving.",
        );
      return repository.finalizeSession(
        current.revision,
        finalizeDraft(current.draft),
      );
    });
  }, [mutate]);
  const discard = useCallback(() => {
    const sessionId = dataRef.current.draft?.id;
    generation.current++;
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    editRef.current = null;
    setEditing(null);
    return mutate((current) => {
      if (current.draft && current.draft.id !== sessionId)
        throw new Error(
          "The unfinished workout changed. Review it before discarding.",
        );
      return repository.saveDraft(current.revision, null);
    });
  }, [mutate]);
  const editRecord = useCallback(
    (record: Draft | Session) =>
      mutate((current) => {
        const original =
          "phase" in record
            ? current.draft
            : current.sessions.find((session) => session.id === record.id);
        if (
          !original ||
          original.id !== record.id ||
          record.revision !== original.revision + 1
        )
          throw new Error(
            "This record changed while you were editing. Reopen it and apply your correction to the latest result.",
          );
        return "phase" in record
          ? repository.saveDraft(current.revision, record)
          : repository.updateSession(current.revision, record);
      }),
    [mutate],
  );
  const preferences = useCallback(
    (prefs: Preferences) =>
      mutate((current) =>
        repository.updatePreferences(current.revision, prefs),
      ),
    [mutate],
  );
  const input =
    editing &&
    editing.sessionId === data.draft?.id &&
    editing.setId === data.draft?.currentSetId
      ? editing.text
      : (data.draft?.input ?? "");
  return (
    <Context.Provider
      value={{
        data,
        ready,
        error,
        busy: pending > 0,
        recovered,
        notice,
        input,
        command,
        start,
        setInput,
        flushInput,
        mutate,
        save,
        discard,
        editRecord,
        preferences,
        refresh,
        retry: () => {
          if (retryRef.current) retryRef.current();
          else void refresh();
        },
        clearError: () => {
          setError(null);
          setNotice(null);
        },
        acceptRecovery: () => setRecovered(false),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const context = useContext(Context);
  if (!context) throw new Error("AppProvider is required");
  return context;
}
