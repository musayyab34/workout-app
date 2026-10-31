"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase, configured, callbackUrl } from "@/lib/supabase/client";
export function AuthForm({
  mode,
  initialMessage = "",
}: {
  mode: "sign-in" | "sign-up" | "forgot-password" | "reset-password";
  initialMessage?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [resendAfter, setResendAfter] = useState(0);
  const labels = {
    "sign-in": "Welcome back",
    "sign-up": "Create your account",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const c = supabase();
      const result =
        mode === "sign-in"
          ? await c.auth.signInWithPassword({ email, password })
          : mode === "sign-up"
            ? await c.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: callbackUrl() },
              })
            : mode === "forgot-password"
              ? await c.auth.resetPasswordForEmail(email, {
                  redirectTo: callbackUrl(),
                })
              : await c.auth.updateUser({ password });
      if (result.error) throw result.error;
      if (mode === "sign-in" || mode === "reset-password") router.push("/");
      else
        setMessage(
          "If this address is eligible, an email will arrive shortly. Check your inbox and spam folder.",
        );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card auth-card">
      <p className="eyebrow">Your private training space</p>
      <h1>{labels[mode]}</h1>
      <p>
        Saved workouts and programs follow your account. Unfinished workouts
        stay on this device.
      </p>
      {!configured ? (
        <p role="status">
          Cloud sync is not configured. <Link href="/">Continue locally</Link>
        </p>
      ) : (
        <form onSubmit={submit} className="stack">
          {mode !== "reset-password" && (
            <label className="field">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "forgot-password" && (
            <>
              <label className="field">
                Password
                <input
                  type={visible ? "text" : "password"}
                  minLength={8}
                  required
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(e) => setVisible(e.target.checked)}
                />{" "}
                Show password
              </label>
            </>
          )}
          <button className="button primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "sign-in"
                ? "Sign in"
                : mode === "sign-up"
                  ? "Create account"
                  : mode === "forgot-password"
                    ? "Send reset email"
                    : "Save password"}
          </button>
          {mode === "sign-up" && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                if (Date.now() < resendAfter) {
                  setMessage("Please wait before requesting another email.");
                  return;
                }
                setResendAfter(Date.now() + 60000);
                const { error } = await supabase().auth.resend({
                  type: "signup",
                  email,
                  options: { emailRedirectTo: callbackUrl() },
                });
                setMessage(
                  error?.message ??
                    "If eligible, another confirmation email will arrive.",
                );
              }}
            >
              Resend confirmation
            </button>
          )}
        </form>
      )}
      {(message || initialMessage) && <p role="status">{message || initialMessage}</p>}
      <div className="row wrap">
        <Link href="/auth/sign-in">Sign in</Link>
        <Link href="/auth/sign-up">Register</Link>
        <Link href="/auth/forgot-password">Forgot password?</Link>
        <Link href="/">Continue locally</Link>
      </div>
    </section>
  );
}
