import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedReadyToPostItem } from "../helpers/queue-helper";

test.describe("Approval -> Published", () => {
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

  test("marks a ready-to-post item as posted and records history", async ({ page }) => {
    const seeded = await seedReadyToPostItem(page);

    await page.goto(`/queue/${seeded.id}`);
    await expect(page.getByTestId("item-status")).toContainText("Post to LinkedIn", {
      timeout: 10_000,
    });

    await page.getByTestId("post-to-linkedin-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("item-status")).toContainText("POSTED", {
      timeout: 15_000,
    });
    await page.getByTestId("audit-trail-toggle").click({ timeout: 10_000 });
    await expect(page.getByTestId("audit-trail-event").first()).toContainText(
      /manually recorded as posted on LinkedIn/i,
      { timeout: 10_000 },
    );
  });
});
