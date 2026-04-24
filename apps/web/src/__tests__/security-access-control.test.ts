import { ContentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/auth/application/auth-service", () => ({
  getCurrentSession: authMocks.getCurrentSession,
}));

vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: prismaMocks.getPrisma,
}));

vi.mock("next/cache", () => ({
  revalidatePath: cacheMocks.revalidatePath,
}));

function buildSession(roles: string[]) {
  return {
    email: "admin@zazmic.com",
    name: "Admin",
    roles,
    mode: "cookie" as const,
  };
}

function extractCookieValue(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return "";
  }

  return setCookieHeader.split(";")[0] ?? "";
}

function createTransactionStub() {
  return {
    contentItem: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    designRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    contentAsset: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    statusEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    workflowNote: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    approvalRecord: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

async function importRoute() {
  vi.resetModules();
  return import("../app/api/queue/clear/route");
}

describe("queue clear access control", () => {
  beforeEach(() => {
    authMocks.getCurrentSession.mockReset();
    prismaMocks.getPrisma.mockReset();
    cacheMocks.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("rejects non-admin sessions at the GET confirmation step", async () => {
    authMocks.getCurrentSession.mockResolvedValue(buildSession(["EDITOR"]));

    const { GET } = await importRoute();
    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Admin only" });
    expect(prismaMocks.getPrisma).not.toHaveBeenCalled();
  });

  it("rejects POST requests when the confirmation token does not match", async () => {
    authMocks.getCurrentSession.mockResolvedValue(buildSession(["ADMIN"]));

    const { POST } = await importRoute();
    const request = new Request("https://mih.local/api/queue/clear", {
      method: "POST",
      headers: {
        cookie: "mih_queue_clear_token=token-from-cookie",
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirmationToken: "different-token" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Confirmation token invalid" });
    expect(prismaMocks.getPrisma).not.toHaveBeenCalled();
  });

  it("soft deletes the queue for admins after a confirmation handshake", async () => {
    authMocks.getCurrentSession.mockResolvedValue(buildSession(["ADMIN"]));

    const tx = createTransactionStub();
    const prisma = {
      contentItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: "content-item-1", currentStatus: ContentStatus.READY_FOR_DESIGN },
          { id: "content-item-2", currentStatus: ContentStatus.IN_DESIGN },
        ]),
      },
      $transaction: vi.fn(
        async (callback: (transaction: ReturnType<typeof createTransactionStub>) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { GET, POST } = await importRoute();
    const getResponse = await GET();
    const confirmationToken = (await getResponse.json()) as { confirmationToken: string };
    const cookieHeader = extractCookieValue(getResponse.headers.get("set-cookie"));

    expect(confirmationToken.confirmationToken).toHaveLength(43);
    expect(cookieHeader).toContain("mih_queue_clear_token=");

    const postRequest = new Request("https://mih.local/api/queue/clear", {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirmationToken: confirmationToken.confirmationToken }),
    });

    const postResponse = await POST(postRequest);
    const postBody = (await postResponse.json()) as { ok: boolean; clearedCount: number };

    expect(postResponse.status).toBe(200);
    expect(postBody).toEqual({ ok: true, clearedCount: 2 });
    expect(prisma.contentItem.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true, currentStatus: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.contentItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["content-item-1", "content-item-2"] } },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.designRequest.updateMany).toHaveBeenCalledWith({
      where: { contentItemId: { in: ["content-item-1", "content-item-2"] }, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(tx.statusEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          contentItemId: "content-item-1",
          note: expect.stringContaining("QUEUE_CLEARED"),
        }),
      ]),
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/queue");
  });
});
