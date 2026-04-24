import { ContentStatus, DesignProvider, DesignRequestStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getCurrentSession: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

const providerMocks = vi.hoisted(() => ({
  getDesignExecutionProvider: vi.fn(),
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

vi.mock("@/modules/design-orchestration/infrastructure/design-provider-registry", () => ({
  getDesignExecutionProvider: providerMocks.getDesignExecutionProvider,
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

async function importActorHelper() {
  vi.resetModules();
  return import("@/modules/workflow/application/get-actor-email");
}

async function importWorkflowActions() {
  vi.resetModules();
  return import("@/modules/workflow/application/workflow-actions");
}

async function importDesignSyncAction() {
  vi.resetModules();
  return import("@/modules/design-orchestration/application/run-design-initiation");
}

describe("audit trail helpers", () => {
  beforeEach(() => {
    authMocks.requireSession.mockReset();
    authMocks.getCurrentSession.mockReset();
    prismaMocks.getPrisma.mockReset();
    providerMocks.getDesignExecutionProvider.mockReset();
    cacheMocks.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns the session email from getActorEmail and falls back to system", async () => {
    const session = buildSession();
    authMocks.getCurrentSession.mockResolvedValue(session);

    const { getActorEmail } = await importActorHelper();
    await expect(getActorEmail()).resolves.toBe(session.email);

    authMocks.getCurrentSession.mockResolvedValue(null);
    await expect(getActorEmail()).resolves.toBe("system");
  });

  it("records posted actions with the real actor email", async () => {
    const session = buildSession();
    authMocks.requireSession.mockResolvedValue(session);

    const txStatusEventCreate = vi.fn().mockResolvedValue(undefined);
    const txContentItemUpdate = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          email: session.email,
        }),
      },
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          currentStatus: ContentStatus.READY_TO_POST,
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          contentItem: {
            update: txContentItemUpdate,
          },
          statusEvent: {
            create: txStatusEventCreate,
          },
        } as never),
      ),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { recordPostedAction } = await importWorkflowActions();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await recordPostedAction(formData);

    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorEmail: session.email,
          note: expect.stringContaining(session.email),
        }),
      }),
    );
    expect(txContentItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStatus: ContentStatus.POSTED,
        }),
      }),
    );
  });

  it("advances review items to ready for design and records the actor email", async () => {
    const session = buildSession();
    authMocks.requireSession.mockResolvedValue(session);

    const txContentItemUpdate = vi.fn().mockResolvedValue(undefined);
    const txStatusEventCreate = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          currentStatus: ContentStatus.IN_REVIEW,
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          contentItem: {
            update: txContentItemUpdate,
          },
          statusEvent: {
            create: txStatusEventCreate,
          },
        } as never),
      ),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { advanceToReadyForDesignAction } = await importWorkflowActions();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await advanceToReadyForDesignAction(formData);

    expect(txContentItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStatus: ContentStatus.READY_FOR_DESIGN,
        }),
      }),
    );
    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorEmail: session.email,
          fromStatus: ContentStatus.IN_REVIEW,
          toStatus: ContentStatus.READY_FOR_DESIGN,
          note: expect.stringContaining("Continue Process"),
        }),
      }),
    );
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/queue/content-item-1");
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith("/queue");
  });

  it("records design sync polling events with the real actor email", async () => {
    const session = buildSession();
    authMocks.requireSession.mockResolvedValue(session);
    authMocks.getCurrentSession.mockResolvedValue(session);

    const txDesignRequestUpdate = vi.fn().mockResolvedValue(undefined);
    const txStatusEventCreate = vi.fn().mockResolvedValue(undefined);
    const txContentItemUpdate = vi.fn().mockResolvedValue(undefined);

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue({
          id: "content-item-1",
          currentStatus: ContentStatus.IN_DESIGN,
          designRequests: [
            {
              id: "design-request-1",
              attemptNumber: 1,
              status: DesignRequestStatus.IN_PROGRESS,
              designProvider: DesignProvider.CANVA,
              externalRequestId: "job-1",
              requestPayload: {},
              resultPayload: {},
            },
          ],
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          designRequest: {
            update: txDesignRequestUpdate,
          },
          statusEvent: {
            create: txStatusEventCreate,
          },
          contentItem: {
            update: txContentItemUpdate,
          },
        } as never),
      ),
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    providerMocks.getDesignExecutionProvider.mockReturnValue({
      syncRequest: vi.fn().mockResolvedValue({
        state: "IN_PROGRESS",
        payload: {
          progress: 0.5,
        },
      }),
    });

    const { syncDesignRequestAction } = await importDesignSyncAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await syncDesignRequestAction(formData);

    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorEmail: session.email,
          fromStatus: ContentStatus.IN_DESIGN,
          toStatus: ContentStatus.IN_DESIGN,
        }),
      }),
    );
    expect(txDesignRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DesignRequestStatus.IN_PROGRESS,
        }),
      }),
    );
    expect(txContentItemUpdate).not.toHaveBeenCalled();
  });
});
