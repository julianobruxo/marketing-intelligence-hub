import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  if (!GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: "Google OAuth is not configured on this server." }, { status: 500 });
  }

  const redirectUri = `${NEXTAUTH_URL}/api/auth/google/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account"); // Force re-selection to aid local testing
  url.searchParams.set("access_type", "online");

  return NextResponse.redirect(url.toString());
}
