import "server-only";

import { google } from "googleapis";
import type { GoogleConnection, Prisma } from "@prisma/client";
import { requireSession } from "./auth-service";
import { getPrisma } from "@/shared/lib/prisma";

export const GOOGLE_DRIVE_DISCOVERY_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
] as const;

export class GoogleConnectionAccessError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleConnectionAccessError";
    this.code = code;
  }
}

export type PersistGoogleConnectionInput = {
  userId: string;
  googleSub: string;
  googleEmail: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  scope?: string | null;
  expiresAt?: Date | null;
  active?: boolean;
};

export async function persistGoogleConnectionForUser(input: PersistGoogleConnectionInput): Promise<GoogleConnection> {
  const prisma = getPrisma();
  const existingConnection = await prisma.googleConnection.findUnique({
    where: { userId: input.userId },
  });

  const accessToken =
    input.accessToken?.trim() || existingConnection?.accessToken || "";

  const updateData: Prisma.GoogleConnectionUncheckedUpdateInput = {
    googleSub: input.googleSub,
    googleEmail: input.googleEmail,
    accessToken,
    active: input.active ?? true,
  };

  if (typeof input.refreshToken === "string" && input.refreshToken.length > 0) {
    updateData.refreshToken = input.refreshToken;
  }

  if (typeof input.scope === "string") {
    updateData.scope = input.scope;
  }

  if (input.expiresAt !== undefined) {
    updateData.expiresAt = input.expiresAt;
  }

  return prisma.googleConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      googleSub: input.googleSub,
      googleEmail: input.googleEmail,
      accessToken,
      refreshToken: typeof input.refreshToken === "string" && input.refreshToken.length > 0 ? input.refreshToken : null,
      scope: typeof input.scope === "string" ? input.scope : null,
      expiresAt: input.expiresAt ?? null,
      active: input.active ?? true,
    },
    update: updateData,
  });
}

export async function getCurrentUserGoogleConnection() {
  const session = await requireSession();
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { email: session.email },
    include: {
      googleConnection: true,
    },
  });

  return user?.googleConnection ?? null;
}

export function buildGoogleOAuthClientForConnection(connection: GoogleConnection) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google OAuth is not configured on this server.",
    );
  }

  const oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauthClient.setCredentials({
    access_token: connection.accessToken || undefined,
    refresh_token: connection.refreshToken || undefined,
    scope: connection.scope || undefined,
    expiry_date: connection.expiresAt ? connection.expiresAt.getTime() : undefined,
    token_type: "Bearer",
  });

  return oauthClient;
}

export async function getCurrentUserGoogleOAuthClient() {
  const connection = await getCurrentUserGoogleConnection();

  if (!connection) {
    throw new GoogleConnectionAccessError(
      "NO_GOOGLE_CONNECTION",
      "No Google connection found for the current user.",
    );
  }

  if (!connection.active) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_CONNECTION_INACTIVE",
      "The current Google connection is inactive.",
    );
  }

  const scopes = (connection.scope ?? "")
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const missingScopes = GOOGLE_DRIVE_DISCOVERY_SCOPES.filter((scope) => !scopes.includes(scope));

  if (missingScopes.length > 0) {
    throw new GoogleConnectionAccessError(
      "INSUFFICIENT_GOOGLE_SCOPES",
      "The connected Google account is missing Drive or Sheets read access. Reconnect Google Drive to continue.",
    );
  }

  const connectionHasUsableToken = Boolean(connection.accessToken || connection.refreshToken);
  if (!connectionHasUsableToken) {
    throw new GoogleConnectionAccessError(
      "MISSING_GOOGLE_CREDENTIALS",
      "No usable Google OAuth credentials are stored for the current user.",
    );
  }

  const oauthClient = buildGoogleOAuthClientForConnection(connection);

  return {
    connection,
    oauthClient,
  };
}
