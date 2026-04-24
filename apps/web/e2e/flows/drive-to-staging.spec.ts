import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData } from "../helpers/queue-helper";

test.describe("Drive -> Staging", () => {
  test.beforeEach(async ({ page }) => {
    await cleanupTestData(page);
    await loginAsMockUser(page);
  });

  test.afterEach(async ({ page }) => {
    try {
      await cleanupTestData(page);
    } catch {
      // Ignore cleanup errors so flakes in teardown do not hide the real failure.
    }
  });

  test("lists mock spreadsheets and stages valid plus skipped rows", async ({ page }) => {
    await page.goto("/import");

    await expect(page.getByTestId("provider-mode-badge")).toContainText("MOCK", {
      timeout: 10_000,
    });

    await page.getByTestId("scan-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("spreadsheet-item")).toHaveCount(3, {
      timeout: 30_000,
    });

    await page.getByTestId("spreadsheet-item").nth(0).click();
    await page.getByTestId("spreadsheet-item").nth(1).click();
    await page.getByTestId("import-selected-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("import-button")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("import-button").click({ timeout: 10_000 });

    await expect(page.getByTestId("staging-results")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("staging-row-valid")).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("staging-row-skipped")).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("skip-reason")).toBeVisible({ timeout: 10_000 });
  });
});
