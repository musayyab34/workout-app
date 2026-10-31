"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "@/features/auth/runtime";
import { useApp } from "@/features/workout/provider";
import { setEntity } from "@/lib/storage/repository";
import { readSync } from "@/lib/storage/repository";
import { resolveConflict } from "@/features/sync/engine";
import {
  cancelAccountImport,
  recoverAccountImport,
} from "@/features/sync/import";
import { createDownload } from "@/lib/backup";
import { type SyncState, emptySync } from "@/features/sync/model";
export function AccountPanel() {
  const account = useAccount(),
    app = useApp();
  const [state, setState] = useState<SyncState>(emptySync),
    [error, setError] = useState("");
  useEffect(() => {
    void readSync()
      .then(setState)
      .catch((e) => setError(e.message));
  }, [app.data.revision, account.status]);
  const action = async (fn: () => Promise<unknown>) => {
    try {
      setError("");
      await fn();
      await app.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <section className="card stack account-panel">
      <h2>Account & synchronization</h2>
      <p>
        {account.owner ? account.email : "Local workspace"} ·{" "}
        <span role="status">{account.status}</span>
      </p>
      {account.owner ? (
        <>
          <p>
            Last successful sync:{" "}
            {state.lastSync
              ? new Date(state.lastSync).toLocaleString()
              : "Not yet"}{" "}
            · {state.pending.length} pending ·{" "}
            {Object.keys(state.conflicts).length} conflicts
          </p>
          <p>
            Unfinished workouts stay on this device. Signing out retains
            recoverable local data for this account.
          </p>
          <div className="row wrap">
            <button
              className="button primary"
              onClick={() => void account.sync()}
            >
              Sync now
            </button>
            <button
              onClick={() =>
                void action(() => recoverAccountImport(account.owner!))
              }
            >
              Resume interrupted account import
            </button>
            <button
              onClick={() => {
                if (confirm("Cancel only if this import has not committed?"))
                  void action(() => cancelAccountImport(account.owner!));
              }}
            >
              Cancel uncommitted import
            </button>
            <button onClick={() => void action(account.logout)}>
              Sign out
            </button>
          </div>
          <p>
            To bring existing progress into this account, select your backup
            below and review Merge. Local-workspace data is never uploaded
            merely by signing in.
          </p>
          {Object.values(state.bases).some((e) => e.payload === null) && (
            <details>
              <summary>Account deletion markers</summary>
              <p>
                These IDs stay deleted unless you explicitly restore them from a
                backup.
              </p>
              {Object.values(state.bases)
                .filter((e) => e.payload === null)
                .map((e) => (
                  <p key={e.kind + e.id}>
                    {e.kind}: {e.id}
                  </p>
                ))}
            </details>
          )}
          {Object.values(state.conflicts).map((c) => (
            <article className="card" key={c.key}>
              <h3>Conflict: {c.key.split(":")[0]}</h3>
              <p>
                Both versions are preserved until you choose. The local
                candidate appears in your totals.
              </p>
              <div className="two-col">
                <div>
                  <h4>Your version</h4>
                  <pre className="conflict-json">
                    {JSON.stringify(c.local, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4>Cloud version</h4>
                  <pre className="conflict-json">
                    {JSON.stringify(c.remote.payload, null, 2)}
                  </pre>
                </div>
              </div>
              <div className="row wrap">
                <button
                  onClick={() => {
                    const f = createDownload(
                      JSON.stringify(
                        {
                          key: c.key,
                          local: c.local,
                          remote: c.remote.payload,
                        },
                        null,
                        2,
                      ),
                      "fitness-conflict.json",
                    );
                    setTimeout(f.release, 60000);
                  }}
                >
                  Export both versions
                </button>
                <button
                  onClick={() =>
                    void action(() => resolveConflict(c.key, "local"))
                  }
                >
                  Keep my version
                </button>
                <button
                  onClick={() =>
                    void action(() => resolveConflict(c.key, "cloud"))
                  }
                >
                  Use cloud
                </button>
              </div>
            </article>
          ))}
        </>
      ) : (
        <div className="row wrap">
          <Link className="button primary" href="/auth/sign-in">
            Sign in
          </Link>
          <Link href="/auth/sign-up">Create account</Link>
        </div>
      )}
      {!!app.data.recoveryCandidates?.length && (
        <section>
          <h3>Preserved recovery alternatives</h3>
          <p>
            These are quarantined alternatives, not additional workouts. Export
            before choosing a replacement.
          </p>
          {app.data.recoveryCandidates.map((raw, i) => {
            const c = raw as {
              key: string;
              local: unknown | null;
              remote: unknown | null;
            };
            return (
              <details key={i}>
                <summary>
                  {c.key.split(":")[0]} alternative {i + 1}
                </summary>
                <pre className="conflict-json">
                  {JSON.stringify(c, null, 2)}
                </pre>
                <button
                  onClick={() => {
                    const f = createDownload(
                      JSON.stringify(c, null, 2),
                      "fitness-recovery-alternative.json",
                    );
                    setTimeout(f.release, 60000);
                  }}
                >
                  Export alternative
                </button>
                {(["local", "remote"] as const).map((side) => (
                  <button
                    key={side}
                    disabled={!c[side]}
                    onClick={() => {
                      if (
                        confirm(
                          "Use this preserved version? This may replace an existing record and will sync if signed in.",
                        )
                      )
                        void action(() =>
                          app.mutate(async (d) => {
                            const { mutateDataset } =
                              await import("@/lib/storage/repository");
                            return mutateDataset(d.revision, (current) =>
                              setEntity(current, c.key, c[side]),
                            );
                          }),
                        );
                    }}
                  >
                    Use {side} candidate
                  </button>
                ))}
              </details>
            );
          })}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
