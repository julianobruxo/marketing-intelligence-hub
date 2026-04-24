import { type Page } from "@playwright/test";

const E2E_ORIGIN = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
const MIH_SESSION_COOKIE_NAME = "mih_session";

async function seedMockSessionCookie(page: Page, role: "user" | "admin") {
  const response = await page.request.fetch(`/api/auth/mock-login?role=${role}`, {
    maxRedirects: 0,
  });

  const setCookie = response.headers()["set-cookie"] ?? "";
  const match = setCookie.match(new RegExp(`${MIH_SESSION_COOKIE_NAME}=([^;]+)`));

  if (!match?.[1]) {
    throw new Error(
      `Mock login did not return a session cookie (status=${response.status()}, headers=${JSON.stringify(
        response.headers(),
      )}).`,
    );
  }

  await page.context().addCookies([
    {
      name: MIH_SESSION_COOKIE_NAME,
      value: match[1],
      url: E2E_ORIGIN,
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

export async function loginAsMockUser(page: Page) {
  await seedMockSessionCookie(page, "user");
  await page.goto("/queue");
  await page.waitForURL(/\/queue(?:\?.*)?$/, { timeout: 10_000 });
}

export async function loginAsAdmin(page: Page) {
  await seedMockSessionCookie(page, "admin");
  await page.goto("/queue");
  await page.waitForURL(/\/queue(?:\?.*)?$/, { timeout: 10_000 });
}
