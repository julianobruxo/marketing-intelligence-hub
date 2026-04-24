import { z } from "zod";

const DEFAULT_LOCAL_NEXTAUTH_SECRET = "default-local-secret-for-dev";
const DEFAULT_CANVA_API_URL = "https://api.canva.com/rest/v1";
const DEFAULT_NB_MODEL = "gemini-3.1-flash-image-preview";
const DEFAULT_GPT_IMAGE_MODEL = "gpt-image-2";

function normalizeOptionalEnv(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function resolveNextAuthSecret() {
  const rawSecret = process.env.NEXTAUTH_SECRET?.trim();

  if (rawSecret && rawSecret.length > 0) {
    if (process.env.NODE_ENV === "production" && rawSecret.length < 32) {
      throw new Error("NEXTAUTH_SECRET must be at least 32 characters in production.");
    }

    return rawSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXTAUTH_SECRET is required in production.");
  }

  if (process.env.NODE_ENV === "development") {
    console.warn("[env] NEXTAUTH_SECRET is missing. Falling back to the local development secret.");
  }

  return DEFAULT_LOCAL_NEXTAUTH_SECRET;
}

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  DEV_AUTH_EMAIL: z.string().email().optional(),
  IAP_AUDIENCE: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DRIVE_PROVIDER_MODE: z.enum(["MOCK", "REAL"]).optional(),
  CANVA_PROVIDER_MODE: z.enum(["MOCK", "REAL"]).optional(),
  CANVA_API_URL: z.string().url().optional(),
  CANVA_API_KEY: z.string().optional(),
  CANVA_API_BASE_URL: z.string().url().optional(),
  CANVA_ACCESS_TOKEN: z.string().optional(),
  NB_PROVIDER_MODE: z.enum(["MOCK", "REAL"]).optional(),
  NB_API_KEY: z.string().optional(),
  NB_MODEL: z.string().optional(),
  GPT_IMAGE_PROVIDER_MODE: z.enum(["MOCK", "REAL"]).optional(),
  GPT_IMAGE_MODEL: z.string().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  DEV_AUTH_EMAIL: process.env.DEV_AUTH_EMAIL,
  IAP_AUDIENCE: process.env.IAP_AUDIENCE,
  NEXTAUTH_SECRET: resolveNextAuthSecret(),
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  GOOGLE_CLIENT_ID: normalizeOptionalEnv(process.env.GOOGLE_CLIENT_ID),
  GOOGLE_CLIENT_SECRET: normalizeOptionalEnv(process.env.GOOGLE_CLIENT_SECRET),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  DRIVE_PROVIDER_MODE: normalizeOptionalEnv(process.env.DRIVE_PROVIDER_MODE),
  CANVA_PROVIDER_MODE: normalizeOptionalEnv(process.env.CANVA_PROVIDER_MODE),
  CANVA_API_URL: normalizeOptionalEnv(process.env.CANVA_API_URL),
  CANVA_API_KEY: normalizeOptionalEnv(process.env.CANVA_API_KEY),
  CANVA_API_BASE_URL: normalizeOptionalEnv(process.env.CANVA_API_BASE_URL),
  CANVA_ACCESS_TOKEN: normalizeOptionalEnv(process.env.CANVA_ACCESS_TOKEN),
  NB_PROVIDER_MODE: normalizeOptionalEnv(process.env.NB_PROVIDER_MODE),
  NB_API_KEY: normalizeOptionalEnv(process.env.NB_API_KEY),
  NB_MODEL: normalizeOptionalEnv(process.env.NB_MODEL),
  GPT_IMAGE_PROVIDER_MODE: normalizeOptionalEnv(process.env.GPT_IMAGE_PROVIDER_MODE),
  GPT_IMAGE_MODEL: normalizeOptionalEnv(process.env.GPT_IMAGE_MODEL),
});

export const AUTHORIZED_EMAIL_DOMAIN = "zazmic.com";
export const DRIVE_PROVIDER_MODE = env.DRIVE_PROVIDER_MODE ?? "MOCK";
export const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = env.GOOGLE_CLIENT_SECRET ?? "";
export const CANVA_PROVIDER_MODE = env.CANVA_PROVIDER_MODE ?? "MOCK";
export const CANVA_API_URL =
  env.CANVA_API_URL ?? env.CANVA_API_BASE_URL ?? DEFAULT_CANVA_API_URL;
export const CANVA_API_KEY = env.CANVA_API_KEY ?? env.CANVA_ACCESS_TOKEN ?? "";
export const NB_PROVIDER_MODE = env.NB_PROVIDER_MODE ?? "MOCK";
export const NB_API_KEY = env.NB_API_KEY ?? "";
export const NB_MODEL = env.NB_MODEL ?? DEFAULT_NB_MODEL;
export const OPENAI_API_KEY = env.OPENAI_API_KEY ?? "";
export const GPT_IMAGE_MODEL = env.GPT_IMAGE_MODEL ?? DEFAULT_GPT_IMAGE_MODEL;
export const GPT_IMAGE_PROVIDER_MODE = env.GPT_IMAGE_PROVIDER_MODE ?? "REAL";

if (DRIVE_PROVIDER_MODE === "REAL" && (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)) {
  throw new Error(
    "DRIVE_PROVIDER_MODE=REAL requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  );
}

// Backward-compatible aliases for legacy call-sites.
export const CANVA_API_BASE_URL = CANVA_API_URL;
export const CANVA_ACCESS_TOKEN = CANVA_API_KEY;
