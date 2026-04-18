import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DIRECT_DATABASE_URL: z.string().optional(),
  DEV_AUTH_EMAIL: z.string().email().optional(),
  IAP_AUDIENCE: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  CANVA_API_BASE_URL: z.string().url().optional(),
  CANVA_ACCESS_TOKEN: z.string().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL,
  DEV_AUTH_EMAIL: process.env.DEV_AUTH_EMAIL,
  IAP_AUDIENCE: process.env.IAP_AUDIENCE,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  CANVA_API_BASE_URL: process.env.CANVA_API_BASE_URL,
  CANVA_ACCESS_TOKEN: process.env.CANVA_ACCESS_TOKEN,
});

export const AUTHORIZED_EMAIL_DOMAIN = "zazmic.com";
