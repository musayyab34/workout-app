import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token_hash"),
    type = request.nextUrl.searchParams.get("type");
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
  } else url.searchParams.set("error", "Invalid confirmation link.");
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
