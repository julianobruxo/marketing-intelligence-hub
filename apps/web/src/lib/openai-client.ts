import "server-only";

import OpenAI from "openai";
import { env } from "@/shared/config/env";

let cachedClient: OpenAI | null = null;

export function getOpenAIClient() {
  if (cachedClient) {
    return cachedClient;
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI spreadsheet analysis.");
  }

  cachedClient = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  return cachedClient;
}

