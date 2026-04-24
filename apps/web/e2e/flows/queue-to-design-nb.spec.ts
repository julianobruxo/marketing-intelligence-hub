import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedReadyForDesignItem } from "../helpers/queue-helper";
import { selectNanoBananaVariation } from "../helpers/design-helper";

test.describe("Queue -> Design (Nano Banana)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupTestData(page);
    await loginAsMockUser(page);
  });

  test.afterEach(async ({ page }) => {
    try {
      await cleanupTestData(page);
    } catch {
      // Ignore cleanup errors so teardown does not mask the real failure.
    }
  });

  test("moves a Nano Banana item through sync, variation selection, and approval", async ({ page }) => {
    test.setTimeout(60_000);
    const seeded = await seedReadyForDesignItem(page, "AI_VISUAL");

    await page.goto("/queue");
    await expect(page.getByTestId("queue-item")).toHaveCount(1, { timeout: 15_000 });
    await page.getByTestId("queue-item").first().click();
    await expect(page).toHaveURL(new RegExp(`/queue/${seeded.id}$`), {
      timeout: 10_000,
    });

    await page.getByTestId("generate-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("design-provider-modal")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("provider-option-nb").click({ timeout: 10_000 });
    await page.getByTestId("preset-card-hook").click({ timeout: 10_000 });
    const variationOptions = page.getByTestId("variation-count-option");
    await expect(variationOptions).toHaveCount(4, { timeout: 10_000 });
    await variationOptions.nth(1).click({ timeout: 10_000 });
    await page.getByTestId("submit-design-button").click({ timeout: 10_000 });

    await expect(page.getByTestId("sync-design-button")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("sync-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("item-status")).toContainText("Approve Design", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("variation-chooser")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("variation-option")).toHaveCount(2, {
      timeout: 10_000,
    });

    await selectNanoBananaVariation(page, 1);
    await page.getByTestId("approve-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("item-status")).toContainText("Final Review", {
      timeout: 30_000,
    });
  });
});
