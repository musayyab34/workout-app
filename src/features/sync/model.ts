export type Kind = "session" | "program" | "preferences";
export type Entity = {
  kind: Kind;
  id: string;
  payload: unknown | null;
  revision: string;
  change: string;
};
export type Request = {
  mutation_id: string;
  protocol: 2;
  owner: string;
  kind: Kind;
  id: string;
  expected: string | null;
  payload: unknown | null;
  restore: boolean;
};
export type Pending = {
  key: string;
  payload: unknown | null;
  request?: Request;
};
export type Conflict = {
  key: string;
  local: unknown | null;
  remote: Entity;
  base?: Entity;
};
export type SyncState = {
  cursor: string;
  bases: Record<string, Entity>;
  pending: Pending[];
  conflicts: Record<string, Conflict>;
  lastSync?: string;
};
export const emptySync = (): SyncState => ({
  cursor: "0",
  bases: {},
  pending: [],
  conflicts: {},
});
export function canonical(x: unknown): string {
  return JSON.stringify(normalize(x));
}
function normalize(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(normalize);
  if (x && typeof x === "object")
    return Object.fromEntries(
      Object.entries(x)
        .filter(([k]) => k !== "revision")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]),
    );
  return x;
}
