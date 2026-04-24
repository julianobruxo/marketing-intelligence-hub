import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { env } from "@/shared/config/env";

const GOOGLE_OAUTH_STATE_COOKIE = "mih_google_oauth_state";
const GOOGLE_OAUTH_NONCE_COOKIE = "mih_google_oauth_nonce";

export async function GET() {
  console.info("[auth/google/login] login route reached");

  if (!env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  const state = randomBytes(16).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const redirectUri = new URL(
    "/api/auth/google/callback",
    env.NEXTAUTH_URL ?? "http://localhost:3000",
  ).toString();

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
  );
  url.searchParams.set("prompt", "consent select_account"); // Request offline consent while still allowing account re-selection locally
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set(GOOGLE_OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
