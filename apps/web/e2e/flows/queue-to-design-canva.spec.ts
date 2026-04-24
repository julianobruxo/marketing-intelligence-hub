import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedReadyForDesignItem } from "../helpers/queue-helper";

test.describe("Queue -> Design (Canva)", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupTestData(page);
    await loginAsMockUser(page);
  });

  test.afterEach(async ({ page }) => {
    try {
      await cleanupTestData(page);
    } catch {
      // Ignore cleanup errors so teardown does not hide the real failure.
    }
  });

  test("moves a Canva item from READY_FOR_DESIGN to DESIGN_READY", async ({ page }) => {
    test.setTimeout(60_000);
    const seeded = await seedReadyForDesignItem(page, "CANVA");

    await page.goto("/queue");
    await expect(page.getByTestId("queue-item")).toHaveCount(1, { timeout: 15_000 });
    await page.getByTestId("queue-item").first().click();
    await expect(page).toHaveURL(new RegExp(`/queue/${seeded.id}$`), {
      timeout: 10_000,
    });

    await page.getByTestId("generate-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("design-provider-modal")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("provider-option-canva").click({ timeout: 10_000 });
    await expect(page.getByTestId("template-option-shawn-static-en-01")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("template-option-shawn-static-en-01").click({ timeout: 10_000 });
    const submitButton = page.getByTestId("submit-design-button");
    await expect(submitButton).toBeVisible({ timeout: 10_000 });
    await submitButton.click({ timeout: 10_000 });

    await expect(page.getByTestId("sync-design-button")).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("sync-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("item-status")).toContainText("Approve Design", {
      timeout: 30_000,
    });
  });
});
