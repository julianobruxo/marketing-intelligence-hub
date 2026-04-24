import { expect, type Page } from "@playwright/test";
import { type MockSeedKind } from "../fixtures/mock-content-item";

export type SeededContentItem = {
  id: string;
  canonicalKey: string;
  kind: MockSeedKind;
  title: string;
  status: string;
  designProvider: string | null;
};

export async function cleanupTestData(page: Page) {
  const response = await page.request.post("/api/test/cleanup");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as {
    ok: true;
    receiptsDeleted: number;
    rowsDeleted: number;
    batchesDeleted: number;
    itemsDeleted: number;
  };
}

export async function seedContentItem(page: Page, kind: MockSeedKind) {
  const response = await page.request.post("/api/test/seed-content-item", {
    data: { kind },
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    ok: true;
    item: SeededContentItem;
  };

  return payload.item;
}

export async function seedReadyForDesignItem(page: Page, provider: "CANVA" | "AI_VISUAL") {
  return seedContentItem(page, provider === "CANVA" ? "canva-ready" : "nb-ready");
}

export async function seedDesignReadyItem(page: Page, provider: "CANVA" | "AI_VISUAL") {
  return seedContentItem(page, provider === "CANVA" ? "design-ready-canva" : "design-ready-nb");
}

export async function seedFailedDesignItem(page: Page, exhausted = false) {
  return seedContentItem(page, exhausted ? "design-failed-exhausted-canva" : "design-failed-canva");
}

export async function seedReadyToPostItem(page: Page) {
  return seedContentItem(page, "ready-to-post");
}
