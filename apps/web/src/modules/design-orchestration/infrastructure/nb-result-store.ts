const NB_RESULT_TTL_MS = 60 * 60 * 1000;
const NB_RESULT_ROUTE_BASE = "/api/design-orchestration/nano-banana/results";

export type StoredNBImage = {
  id: string;
  imageBase64: string;
  mimeType: string;
  prompt: string;
  generatedAt: Date;
};

export type StoredNBResult = {
  requestId: string;
  images: StoredNBImage[];
  prompt: string;
  generatedAt: Date;
  variationCount: number;
  expiresAt: Date;
};

const resultStore = new Map<string, StoredNBResult>();

function cleanupExpiredResults(now = new Date()) {
  for (const [requestId, result] of resultStore.entries()) {
    if (result.expiresAt.getTime() <= now.getTime()) {
      resultStore.delete(requestId);
    }
  }
}

export function buildNBResultImageUrl(requestId: string, variationId: string): string {
  return `${NB_RESULT_ROUTE_BASE}/${encodeURIComponent(requestId)}/${encodeURIComponent(variationId)}`;
}

export function storeNBResult(
  requestId: string,
  images: Omit<StoredNBImage, "prompt" | "generatedAt">[],
  input: {
    prompt: string;
    generatedAt?: Date;
    ttlMs?: number;
  },
) {
  const now = input.generatedAt ?? new Date();
  const ttlMs = input.ttlMs ?? NB_RESULT_TTL_MS;

  cleanupExpiredResults(now);
  resultStore.set(requestId, {
    requestId,
    images: images.map((image) => ({
      ...image,
      prompt: input.prompt,
      generatedAt: now,
    })),
    prompt: input.prompt,
    generatedAt: now,
    variationCount: images.length,
    expiresAt: new Date(now.getTime() + ttlMs),
  });
}

export function getNBResult(requestId: string): StoredNBResult | null {
  cleanupExpiredResults();

  const result = resultStore.get(requestId);
  if (!result) return null;

  if (result.expiresAt.getTime() <= Date.now()) {
    resultStore.delete(requestId);
    return null;
  }

  return result;
}

export function getNBResultImage(requestId: string, variationId: string): StoredNBImage | null {
  const result = getNBResult(requestId);
  if (!result) return null;

  return result.images.find((image) => image.id === variationId) ?? null;
}

export function clearNBResultStoreForTests() {
  resultStore.clear();
}
