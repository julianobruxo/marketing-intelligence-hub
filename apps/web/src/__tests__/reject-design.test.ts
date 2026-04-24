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

async function importAction() {
  vi.resetModules();
  return import("@/modules/design-orchestration/application/reject-design");
}

function buildSession() {
  return {
    email: "operator@zazmic.com",
    name: "Operator",
    roles: ["ADMIN"],
    mode: "cookie" as const,
  };
}

describe("rejectDesignAction", () => {
  beforeEach(() => {
    authMocks.requireSession.mockReset();
    authMocks.getCurrentSession.mockReset();
    prismaMocks.getPrisma.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("moves a ready design back to changes requested and writes the audit trail", async () => {
    const session = buildSession();
    authMocks.requireSession.mockResolvedValue(session);
    authMocks.getCurrentSession.mockResolvedValue(session);

    const txDesignRequestUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txContentItemUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txStatusEventCreate = vi.fn().mockResolvedValue(undefined);
    const txWorkflowNoteCreate = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "content-item-1",
          currentStatus: ContentStatus.DESIGN_READY,
          designRequests: [
            {
              id: "design-request-1",
              attemptNumber: 1,
              status: DesignRequestStatus.READY,
              deletedAt: null,
              createdAt: new Date("2026-04-21T10:00:00.000Z"),
              updatedAt: new Date("2026-04-21T10:00:00.000Z"),
            },
          ],
        }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          email: session.email,
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
          workflowNote: {
            create: txWorkflowNoteCreate,
          },
        } as never),
      ),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { rejectDesignAction } = await importAction();
    const result = await rejectDesignAction({
      contentItemId: "content-item-1",
      reason: "Wrong visual style",
      feedback: "The composition does not match the approved brief.",
    });

    expect(result).toEqual({ success: true });
    expect(txContentItemUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "content-item-1",
          currentStatus: ContentStatus.DESIGN_READY,
        }),
        data: {
          currentStatus: ContentStatus.CHANGES_REQUESTED,
        },
      }),
    );
    expect(txDesignRequestUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "design-request-1",
          status: DesignRequestStatus.READY,
        }),
        data: expect.objectContaining({
          status: DesignRequestStatus.REJECTED,
          errorCode: "DESIGN_REJECTED",
          errorMessage: "Wrong visual style",
        }),
      }),
    );
    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorEmail: session.email,
          fromStatus: ContentStatus.DESIGN_READY,
          toStatus: ContentStatus.CHANGES_REQUESTED,
          note: expect.stringContaining("Wrong visual style"),
        }),
      }),
    );
    expect(txWorkflowNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: "user-1",
          type: "REVISION",
          body: "The composition does not match the approved brief.",
        }),
      }),
    );
  });

  it("rejects design rejection when the item is not in DESIGN_READY", async () => {
    const session = buildSession();
    authMocks.requireSession.mockResolvedValue(session);
    authMocks.getCurrentSession.mockResolvedValue(session);

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "content-item-1",
          currentStatus: ContentStatus.DESIGN_APPROVED,
          designRequests: [],
        }),
      },
      user: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { rejectDesignAction } = await importAction();
    const result = await rejectDesignAction({
      contentItemId: "content-item-1",
      reason: "Wrong visual style",
    });

    expect(result).toEqual({
      success: false,
      error: "Item is not in DESIGN_READY.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
