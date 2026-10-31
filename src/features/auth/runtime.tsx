/* eslint-disable react-hooks/exhaustive-deps -- one auth subscription; transitions are serialized independently */
"use client";
import { usePathname } from "next/navigation";
import type { Session, AuthChangeEvent } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { configured, supabase } from "@/lib/supabase/client";
import { selectWorkspace } from "@/lib/storage/db";
import { createDownload } from "@/lib/backup";
import { rawLegacyExport } from "@/lib/storage/migration";
import { migrateLegacy } from "@/lib/storage/migration";
import { AppProvider, useApp } from "@/features/workout/provider";
import { synchronize } from "@/features/sync/engine";
import { readSync } from "@/lib/storage/repository";
const Context = createContext<{
  owner: string | null;
  email: string;
  status: string;
  sync: () => Promise<void>;
  logout: () => Promise<void>;
}>({
  owner: null,
  email: "",
  status: "Local workspace",
  sync: async () => {},
  logout: async () => {},
});
export const useAccount = () => useContext(Context);
export function Runtime({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<{
      id: string | null;
      email: string;
    } | null>(null),
    [error, setError] = useState("");
  const current = useRef<string | null>(null);
  const initialized = useRef(false);
  const chain = useRef(Promise.resolve());
  const prepare = useRef<(() => Promise<void>) | null>(null);
  const change = useCallback((id: string | null, email: string) => {
    chain.current = chain.current
      .then(async () => {
        if (initialized.current && current.current === id) return;
        await prepare.current?.();
        setIdentity(null);
        const project = configured
          ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname
          : "local";
        await selectWorkspace(
          "fitness-tracker-v2:" + (id ? project + ":" + id : "local"),
          !!id,
        );
        if (!id) await migrateLegacy();
        current.current = id;
        initialized.current = true;
        setIdentity({ id, email });
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!configured) {
      change(null, "");
      return;
    }
    let alive = true;
    void supabase()
      .auth.getSession()
      .then(({ data }: { data: { session: Session | null } }) => {
        if (alive)
          change(data.session?.user.id ?? null, data.session?.user.email ?? "");
      });
    const { data } = supabase().auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session && session.user.id !== current.current)
          setTimeout(() => {
            if (alive) change(session.user.id, session.user.email ?? "");
          }, 0);
      },
    );
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []); // identity transitions are serialized, never driven by rendering
  if (error)
    return (
      <main className="app-main">
        <h1>Storage needs attention</h1>
        <p role="alert">{error}</p>
        <p>Keep your data. Close older tabs and reload to retry.</p>
        <button
          className="button secondary"
          onClick={async () => {
            try {
              const file = createDownload(
                JSON.stringify(await rawLegacyExport(), null, 2),
                "fitness-legacy-raw-recovery.json",
              );
              setTimeout(file.release, 60000);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Export raw legacy records for recovery
        </button>
      </main>
    );
  if (!identity)
    return <main className="loading">Opening your training workspace…</main>;
  return (
    <AppProvider key={identity.id ?? "guest"}>
      <Bridge
        identity={identity}
        switchGuest={() => change(null, "")}
        registerPrepare={(fn) => {
          prepare.current = fn;
        }}
      >
        {children}
      </Bridge>
    </AppProvider>
  );
}
function Bridge({
  identity,
  switchGuest,
  registerPrepare,
  children,
}: {
  identity: { id: string | null; email: string };
  switchGuest: () => void;
  registerPrepare: (fn: () => Promise<void>) => void;
  children: ReactNode;
}) {
  const app = useApp();
  const path = usePathname();
  const [bootstrapped, setBootstrapped] = useState(!identity.id);
  const [status, setStatus] = useState(
    identity.id
      ? "Waiting to sync"
      : configured
        ? "Local workspace"
        : "Cloud sync not configured",
  );
  const running = useRef(false);
  const retry = useRef({ attempt: 0, after: 0 });
  const alive = useRef(true);
  const sync = useCallback(async () => {
    if (!identity.id || running.current || !app.ready) return;
    running.current = true;
    setStatus("Syncing");
    try {
      await app.flushInput();
      await synchronize(identity.id);
      if (!alive.current) return;
      await app.refresh();
      setBootstrapped(true);
      retry.current = { attempt: 0, after: 0 };
      const s = await readSync();
      setStatus(
        Object.keys(s.conflicts).length
          ? "Conflict needs review"
          : s.pending.length
            ? "Saved on this device — waiting to sync"
            : "Synced",
      );
    } catch (e) {
      retry.current.attempt++;
      retry.current.after =
        Date.now() +
        Math.min(300000, 1000 * 2 ** Math.min(retry.current.attempt, 8)) *
          (0.8 + Math.random() * 0.4);
      if (alive.current) setStatus((e as Error).message);
    } finally {
      running.current = false;
    }
  }, [identity.id, app]);
  useEffect(() => {
    void readSync().then((s) => {
      if (s.lastSync) setBootstrapped(true);
    });
    registerPrepare(async () => {
      await app.flushInput();
      if (
        app.data.draft &&
        app.data.draft.phase !== "review" &&
        app.data.draft.phase !== "paused"
      )
        await app.command({ type: "pause" });
    });
  }, [app.flushInput, app.data.draft]);
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);
  useEffect(() => {
    alive.current = true;
    const run = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= retry.current.after
      )
        void syncRef.current();
    };
    const timer = setInterval(run, 30000);
    window.addEventListener("online", run);
    window.addEventListener("form-local-change", run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("online", run);
      window.removeEventListener("form-local-change", run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, []);
  useEffect(() => {
    if (app.ready && identity.id) {
      const t = setTimeout(() => void syncRef.current(), 800);
      return () => clearTimeout(t);
    }
  }, [app.ready, identity.id]);
  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("form-auth");
    channel.onmessage = (e) => {
      if (e.data === "signed-out") switchGuest();
    };
    return () => channel.close();
  }, []);
  const logout = async () => {
    await app.flushInput();
    if (
      app.data.draft &&
      app.data.draft.phase !== "review" &&
      app.data.draft.phase !== "paused" &&
      !(await app.command({ type: "pause" }))
    )
      return;
    alive.current = false;
    await supabase().auth.signOut({ scope: "local" });
    if (typeof BroadcastChannel !== "undefined") {
      const c = new BroadcastChannel("form-auth");
      c.postMessage("signed-out");
      c.close();
    }
    switchGuest();
  };
  if (identity.id && !bootstrapped && !path.startsWith("/auth/"))
    return (
      <main className="app-main">
        <h1>Opening your cloud history</h1>
        <p role="status">{status}</p>
        <p>
          Your existing records are preserved. We will show complete account
          totals after the first successful sync.
        </p>
        <button className="button primary" onClick={() => void sync()}>
          Retry synchronization
        </button>
        <a className="button primary" href="/auth/sign-in">
          Sign in again
        </a>
        <button onClick={() => void logout()}>Return to local workspace</button>
      </main>
    );
  return (
    <Context.Provider
      value={{
        owner: identity.id,
        email: identity.email,
        status,
        sync,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}
