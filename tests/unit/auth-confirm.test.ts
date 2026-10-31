import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/auth/confirm/route";

const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  serverClient: async () => ({ auth }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  auth.verifyOtp.mockResolvedValue({ error: null });
  auth.exchangeCodeForSession.mockResolvedValue({
    error: null,
    data: { redirectType: null },
  });
});

async function confirm(query: string) {
  return GET(new NextRequest(`https://form.example/auth/confirm?${query}`));
}

it("accepts customized signup links and removes tokens from the destination", async () => {
  const response = await confirm("token_hash=test-token&type=email");
  expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "test-token", type: "email" });
  expect(response.headers.get("location")).toBe("https://form.example/");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

it("accepts customized recovery links", async () => {
  const response = await confirm("token_hash=test-token&type=recovery");
  expect(response.headers.get("location")).toBe("https://form.example/auth/reset-password");
});

it("exchanges default-template signup codes", async () => {
  const response = await confirm("code=test-code");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(response.headers.get("location")).toBe("https://form.example/");
});

it("uses the SDK recovery marker for default-template password reset", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: null, data: { redirectType: "recovery" } });
  const response = await confirm("code=test-code");
  expect(response.headers.get("location")).toBe("https://form.example/auth/reset-password");
});

it("explains missing/expired verifier failures without exposing codes", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ error: new Error("missing verifier"), data: {} });
  const response = await confirm("code=test-code");
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/auth/sign-in");
  expect(destination.searchParams.get("error")).toContain("browser where you requested it");
  expect(destination.search).not.toContain("test-code");
});

it("rejects invalid token types instead of exchanging an accompanying code", async () => {
  const response = await confirm("token_hash=test-token&type=admin&code=test-code");
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
});

it("never follows an external next destination", async () => {
  const response = await confirm("code=test-code&next=https://untrusted.example");
  expect(response.headers.get("location")).toBe("https://form.example/");
});

it("handles rejected customized links safely", async () => {
  auth.verifyOtp.mockResolvedValue({ error: new Error("expired") });
  const response = await confirm("token_hash=test-token&type=email");
  const destination = new URL(response.headers.get("location")!);
  expect(destination.pathname).toBe("/auth/sign-in");
  expect(destination.searchParams.get("error")).toContain("expired");
  expect(destination.search).not.toContain("test-token");
});
