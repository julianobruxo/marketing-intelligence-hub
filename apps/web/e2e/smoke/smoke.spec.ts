import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedReadyForDesignItem } from "../helpers/queue-helper";

test.afterEach(async ({ page }) => {
  try {
    await cleanupTestData(page);
  } catch {
    // Ignore cleanup errors so teardown does not mask the real failure.
  }
});

test("smoke: mock workflow boots and renders the main surfaces", async ({ page }) => {
  await cleanupTestData(page);
  await loginAsMockUser(page);

  const seeded = await seedReadyForDesignItem(page, "CANVA");

  await page.goto("/queue");
  await expect(page.getByTestId("queue-item")).toHaveCount(1, { timeout: 15_000 });

  await page.goto("/import");
  await expect(page.getByTestId("provider-mode-badge")).toContainText("MOCK", {
    timeout: 10_000,
  });

  await page.goto(`/queue/${seeded.id}`);
  await expect(page.getByTestId("item-detail")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("item-status")).toBeVisible({ timeout: 10_000 });
  await expect(page).not.toHaveURL(/\/error/);
});
