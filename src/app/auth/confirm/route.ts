import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash"),
    type = request.nextUrl.searchParams.get("type"),
    code = request.nextUrl.searchParams.get("code");
  const url = new URL("/auth/sign-in", request.url);
  if (token && (type === "email" || type === "recovery")) {
    const client = await serverClient();
    const { error } = await client.auth.verifyOtp({ token_hash: token, type });
    if (!error)
      url.pathname = type === "recovery" ? "/auth/reset-password" : "/";
    else
      url.searchParams.set(
        "error",
        "This link expired or was already used. Request another email.",
      );
  } else if (code && !token) {
    // Supabase's default ConfirmationURL verifies the email, then redirects
    // here with a PKCE code. The browser's verifier cookie binds this exchange
    // to the browser where signup/password recovery was requested.
    const client = await serverClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (!error)
      url.pathname = "redirectType" in data && data.redirectType === "recovery" ? "/auth/reset-password" : "/";
    else
      url.searchParams.set(
        "error",
        "Open the email link in the browser where you requested it, or request a new link. If your email is already confirmed, you can sign in below.",
      );
  } else url.searchParams.set("error", "Invalid confirmation link.");
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
