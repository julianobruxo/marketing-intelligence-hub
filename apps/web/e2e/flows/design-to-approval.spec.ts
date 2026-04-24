import { expect, test } from "@playwright/test";
import { loginAsMockUser } from "../helpers/auth-helper";
import { cleanupTestData, seedDesignReadyItem } from "../helpers/queue-helper";
import { MOCK_APPROVAL_NOTE } from "../fixtures/mock-design-results";

test.describe("Design -> Approval", () => {
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

  test("approves a ready Canva design and records the audit trail", async ({ page }) => {
    const seeded = await seedDesignReadyItem(page, "CANVA");

    await page.goto(`/queue/${seeded.id}`);
    await expect(page.getByTestId("item-status")).toContainText("Approve Design", {
      timeout: 10_000,
    });

    await page.getByTestId("approve-design-button").click({ timeout: 10_000 });
    await expect(page.getByTestId("item-status")).toContainText("Final Review", {
      timeout: 15_000,
    });
    await page.getByTestId("audit-trail-toggle").click({ timeout: 10_000 });
    await expect(page.getByTestId("audit-trail-event").first()).toContainText(MOCK_APPROVAL_NOTE, {
      timeout: 10_000,
    });
  });
});
