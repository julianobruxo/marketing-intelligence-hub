import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData } from "../helpers/queue-helper";

test.describe("Staging -> Queue", () => {
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

  test("sends a staged spreadsheet to the workflow queue", async ({ page }) => {
    await page.goto("/import");
    await page.getByTestId("scan-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("spreadsheet-item")).toHaveCount(3, {
      timeout: 30_000,
    });

    await page.getByTestId("spreadsheet-item").nth(1).click();
    await page.getByTestId("import-selected-button").click({ timeout: 10_000 });
    await page.getByTestId("import-button").click({ timeout: 10_000 });

    await expect(page.getByTestId("staging-row-valid")).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.getByTestId("staging-row-skipped")).toHaveCount(0, {
      timeout: 15_000,
    });

    await page.getByTestId("staging-row-valid").click();
    await page.getByTestId("send-to-workflow-queue-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("workflow-activity-item").first()).toContainText(
      /spreadsheet moved into the queue/i,
      { timeout: 15_000 },
    );

    await page.goto("/queue");
    await expect(page).toHaveURL(/\/queue(?:\?.*)?$/, { timeout: 10_000 });
    await expect(page.getByTestId("queue-item")).toHaveCount(2, { timeout: 15_000 });

    await page.getByTestId("queue-item").first().click();
    await expect(page).toHaveURL(/\/queue\/[^/]+$/, { timeout: 10_000 });
    await expect(page.getByTestId("item-status")).toContainText("Waiting for Copy", {
      timeout: 10_000,
    });
  });
});
