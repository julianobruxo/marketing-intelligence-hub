import { ContentStatus, DesignRequestStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getCurrentSession: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/auth/application/auth-service", () => ({
  requireSession: authMocks.requireSession,
  getCurrentSession: authMocks.getCurrentSession,
}));

vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: prismaMocks.getPrisma,
}));

vi.mock("next/cache", () => ({
  revalidatePath: cacheMocks.revalidatePath,
}));

function buildSession() {
  return {
    email: "operator@zazmic.com",
    name: "Operator",
    roles: ["ADMIN"],
    mode: "cookie" as const,
  };
}

async function importAction() {
  vi.resetModules();
  return import("@/modules/design-orchestration/application/reset-design-state");
}

describe("resetDesignStateAction", () => {
  beforeEach(() => {
    authMocks.requireSession.mockReset();
    authMocks.getCurrentSession.mockReset();
    prismaMocks.getPrisma.mockReset();
    cacheMocks.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("resets stuck IN_DESIGN items and cancels pending design requests", async () => {
    const session = buildSession();
    authMocks.requireSession.mockResolvedValue(session);
    authMocks.getCurrentSession.mockResolvedValue(session);

    const txContentItemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txDesignRequestUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const txStatusEventCreate = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          currentStatus: ContentStatus.IN_DESIGN,
          designRequests: [],
          assets: [],
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          contentItem: {
            updateMany: txContentItemUpdateMany,
          },
          designRequest: {
            updateMany: txDesignRequestUpdateMany,
          },
          statusEvent: {
            create: txStatusEventCreate,
          },
        } as never),
      ),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { resetDesignStateAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await resetDesignStateAction(formData);

    expect(txContentItemUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "content-item-1",
        currentStatus: ContentStatus.IN_DESIGN,
        deletedAt: null,
      },
      data: {
        currentStatus: ContentStatus.READY_FOR_DESIGN,
      },
    });
    expect(txDesignRequestUpdateMany).toHaveBeenCalledWith({
      where: {
        contentItemId: "content-item-1",
        deletedAt: null,
        status: {
          in: [
            DesignRequestStatus.REQUESTED,
            DesignRequestStatus.IN_PROGRESS,
            DesignRequestStatus.READY,
            DesignRequestStatus.APPROVED,
          ],
        },
      },
      data: {
        status: DesignRequestStatus.FAILED,
        errorCode: "DESIGN_RESET_BY_OPERATOR",
        errorMessage: "Design reset by operator",
      },
    });
    expect(txStatusEventCreate).toHaveBeenCalledWith({
      data: {
        contentItemId: "content-item-1",
        fromStatus: ContentStatus.IN_DESIGN,
        toStatus: ContentStatus.READY_FOR_DESIGN,
        actorEmail: session.email,
        note: "Design reset by operator",
      },
    });
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/queue/content-item-1");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/queue");
  });
});
