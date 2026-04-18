import { NextResponse } from "next/server";

export async function GET() {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  console.info("[auth/google/login] login route reached");

  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  const redirectUri = `${NEXTAUTH_URL}/api/auth/google/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
  );
  url.searchParams.set("prompt", "consent select_account"); // Request offline consent while still allowing account re-selection locally
  url.searchParams.set("access_type", "offline");

  return NextResponse.redirect(url.toString());
}
