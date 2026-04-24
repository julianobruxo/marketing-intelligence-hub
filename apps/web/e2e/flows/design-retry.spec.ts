import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedFailedDesignItem } from "../helpers/queue-helper";

test.describe("Design Retry", () => {
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

  test("opens a retry modal pre-filled with the last Canva template", async ({ page }) => {
    const seeded = await seedFailedDesignItem(page, false);

    await page.goto(`/queue/${seeded.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("item-detail")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("retry-design-button")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("retry-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("design-provider-modal")).toBeVisible({ timeout: 10_000 });

    const selectedTemplate = page.getByTestId("template-option-shawn-static-en-02");
    await expect(selectedTemplate).toHaveAttribute("data-selected", "true", {
      timeout: 10_000,
    });
  });

  test("blocks retry after attempts are exhausted", async ({ page }) => {
    const seeded = await seedFailedDesignItem(page, true);

    await page.goto(`/queue/${seeded.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("item-detail")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("item-status")).toContainText("Design Failed", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("retry-exhausted-message")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("retry-design-button")).not.toBeVisible();
  });
});
