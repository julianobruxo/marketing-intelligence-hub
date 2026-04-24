import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedDesignReadyItem } from "../helpers/queue-helper";

test.describe("Design Rejection", () => {
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

  test("shows the rejection form in DESIGN_READY and returns the item to changes requested", async ({
    page,
  }) => {
    const seeded = await seedDesignReadyItem(page, "CANVA");

    await page.goto(`/queue/${seeded.id}`);
    await expect(page.getByTestId("item-status")).toContainText("Approve Design", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("reject-design-button")).toBeVisible({ timeout: 10_000 });

    await page.getByTestId("reject-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("reject-reason-select")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("confirm-rejection-button")).toBeDisabled();

    await page.getByTestId("reject-reason-select").selectOption("Wrong visual style");
    await page.getByTestId("reject-feedback-textarea").fill(
      "The palette and composition do not match the approved brief.",
    );
    await expect(page.getByTestId("confirm-rejection-button")).toBeEnabled({
      timeout: 10_000,
    });

    await page.getByTestId("confirm-rejection-button").click({ timeout: 10_000 });

    await expect(page.getByTestId("item-status")).toContainText("Changes Requested", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("retry-design-button")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("reject-design-button")).not.toBeVisible();

    await page.goto("/queue");
    await expect(page.getByTestId("queue-item")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("queue-item").first()).toContainText("Changes Requested", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("queue-item").first()).toContainText("Retry Design", {
      timeout: 10_000,
    });
  });
});
