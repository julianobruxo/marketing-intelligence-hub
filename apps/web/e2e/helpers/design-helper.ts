import { expect, type Page } from "@playwright/test";

const NB_PRESET_IDS = [
  "hook",
  "explainer",
  "authority",
  "threat",
  "resource",
  "map",
  "clickbait",
  "abstract",
] as const;

const CANVA_TEMPLATE_IDS = [
  "shawn-static-en-01",
  "shawn-static-en-02",
  "shawn-static-en-03",
] as const;

export async function openQueueItem(page: Page, itemId: string) {
  await page.goto(`/queue/${itemId}`);
  await expect(page.getByTestId("item-detail")).toBeVisible();
}

export async function openGenerateDesignModal(page: Page) {
  await page.getByTestId("generate-design-button").click({ timeout: 10_000 });
  await expect(page.getByTestId("design-provider-modal")).toBeVisible({ timeout: 10_000 });
}

export async function openRetryDesignModal(page: Page) {
  await page.getByTestId("retry-design-button").click({ timeout: 10_000 });
  await expect(page.getByTestId("design-provider-modal")).toBeVisible({ timeout: 10_000 });
}

export async function createCanvaDesign(page: Page, templateIndex = 0) {
  await openGenerateDesignModal(page);
  await page.getByTestId("provider-option-canva").click();
  const templateId = CANVA_TEMPLATE_IDS[templateIndex] ?? CANVA_TEMPLATE_IDS[0];
  await expect(page.getByTestId(`template-option-${templateId}`)).toBeVisible({
    timeout: 10_000,
  });
  await page.getByTestId(`template-option-${templateId}`).click({ timeout: 10_000 });
  await expect(page.getByTestId("submit-design-button")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("submit-design-button").click({ timeout: 10_000 });
  await expect(page.getByTestId("sync-design-button")).toBeVisible({ timeout: 30_000 });
}

export async function createNanoBananaDesign(
  page: Page,
  options?: {
    presetIndex?: number;
    presetId?: (typeof NB_PRESET_IDS)[number];
    variationCount?: number;
    customPrompt?: string;
  },
) {
  const presetIndex = options?.presetIndex ?? 0;
  const presetId = options?.presetId ?? NB_PRESET_IDS[presetIndex] ?? NB_PRESET_IDS[0];
  const variationCount = options?.variationCount ?? 2;

  await openGenerateDesignModal(page);
  await page.getByTestId("provider-option-nb").click({ timeout: 10_000 });
  await page.getByTestId(`preset-card-${presetId}`).click({ timeout: 10_000 });
  if (options?.customPrompt) {
    await page.getByTestId("custom-prompt-input").fill(options.customPrompt);
  }

  const variationOptions = page.getByTestId("variation-count-option");
  await expect(variationOptions).toHaveCount(4);
  await variationOptions.nth(variationCount - 1).click({ timeout: 10_000 });
  await page.getByTestId("submit-design-button").click({ timeout: 10_000 });
}

export async function syncDesign(page: Page) {
  await page.getByTestId("sync-design-button").click({ timeout: 10_000 });
}

export async function approveDesign(page: Page) {
  await page.getByTestId("approve-design-button").click({ timeout: 10_000 });
}

export async function postToLinkedIn(page: Page) {
  await page.getByTestId("post-to-linkedin-button").click({ timeout: 10_000 });
}

export async function selectNanoBananaVariation(page: Page, index = 0) {
  const variation = page.getByTestId("variation-option").nth(index);
  await variation.click({ timeout: 10_000 });
  await expect(variation).toHaveAttribute("data-selected", "true");
}
