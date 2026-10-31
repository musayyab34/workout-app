import { createBrowserClient } from "@supabase/ssr";
export const configured = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
let client: ReturnType<typeof createBrowserClient> | undefined;
export function supabase() {
  if (!configured)
    throw new Error(
      "Cloud sync is not configured. Local recording and backups remain available.",
    );
  return (client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  ));
}
export function callbackUrl() {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin)
    throw new Error(
      "NEXT_PUBLIC_APP_URL must be configured for authentication emails.",
    );
  const u = new URL(origin);
  if (u.pathname !== "/" || u.search || u.hash || u.username || u.password)
    throw new Error("Invalid application origin");
  return u.origin + "/auth/confirm";
}
