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

async function importAction() {
  vi.resetModules();
  return import("@/modules/design-orchestration/application/run-design-initiation");
}

function buildActiveDesignRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "design-request-1",
    attemptNumber: 1,
    status: DesignRequestStatus.IN_PROGRESS,
    designProvider: DesignProvider.CANVA,
    externalRequestId: "job-1",
    requestPayload: {},
    resultPayload: {},
    deletedAt: null,
    ...overrides,
  };
}

describe("design sync retry handling", () => {
  beforeEach(() => {
    authMocks.requireSession.mockReset();
    authMocks.getCurrentSession.mockReset();
    prismaMocks.getPrisma.mockReset();
    providerMocks.getDesignExecutionProvider.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("keeps the item in IN_DESIGN after a retryable sync failure and records the failure count", async () => {
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
          designRequests: [buildActiveDesignRequest()],
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
        state: "FAILED",
        payload: {
          transient: true,
        },
        errorCode: "CANVA_TIMEOUT",
        errorMessage: "timeout",
        retryable: true,
      }),
    });

    const { syncDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await syncDesignRequestAction(formData);

    expect(txContentItemUpdate).not.toHaveBeenCalled();
    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: ContentStatus.IN_DESIGN,
          toStatus: ContentStatus.IN_DESIGN,
        }),
      }),
    );

    const updateArg = vi.mocked(txDesignRequestUpdate).mock.calls[0]?.[0];
    expect(updateArg?.data.status).toBe(DesignRequestStatus.IN_PROGRESS);
    expect(updateArg?.data.resultPayload.syncFailures).toHaveLength(1);
  });

  it("escalates to DESIGN_FAILED after five retryable sync failures", async () => {
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
            buildActiveDesignRequest({
              resultPayload: {
                syncFailures: [
                  {
                    attempt: 1,
                    errorCode: "CANVA_TIMEOUT",
                    errorMessage: "timeout",
                    retryable: true,
                    recordedAt: "2026-04-21T10:00:00.000Z",
                    stage: "provider_sync",
                  },
                  {
                    attempt: 2,
                    errorCode: "CANVA_TIMEOUT",
                    errorMessage: "timeout",
                    retryable: true,
                    recordedAt: "2026-04-21T10:01:00.000Z",
                    stage: "provider_sync",
                  },
                  {
                    attempt: 3,
                    errorCode: "CANVA_TIMEOUT",
                    errorMessage: "timeout",
                    retryable: true,
                    recordedAt: "2026-04-21T10:02:00.000Z",
                    stage: "provider_sync",
                  },
                  {
                    attempt: 4,
                    errorCode: "CANVA_TIMEOUT",
                    errorMessage: "timeout",
                    retryable: true,
                    recordedAt: "2026-04-21T10:03:00.000Z",
                    stage: "provider_sync",
                  },
                ],
              },
            }),
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
        state: "FAILED",
        payload: {
          transient: true,
        },
        errorCode: "CANVA_TIMEOUT",
        errorMessage: "timeout",
        retryable: true,
      }),
    });

    const { syncDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await syncDesignRequestAction(formData);

    expect(txContentItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStatus: ContentStatus.DESIGN_FAILED,
        }),
      }),
    );
    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toStatus: ContentStatus.DESIGN_FAILED,
        }),
      }),
    );
    const updateArg = vi.mocked(txDesignRequestUpdate).mock.calls[0]?.[0];
    expect(updateArg?.data.status).toBe(DesignRequestStatus.FAILED);
    expect(updateArg?.data.resultPayload.syncFailures).toHaveLength(5);
    expect(updateArg?.data.resultPayload.retryable).toBe(false);
  });

  it("fails immediately for terminal sync errors", async () => {
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
          designRequests: [buildActiveDesignRequest()],
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
        state: "FAILED",
        payload: {
          transient: false,
        },
        errorCode: "CANVA_INVALID_TEMPLATE",
        errorMessage: "invalid template",
        retryable: false,
      }),
    });

    const { syncDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");

    await syncDesignRequestAction(formData);

    expect(txContentItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStatus: ContentStatus.DESIGN_FAILED,
        }),
      }),
    );
    const updateArg = vi.mocked(txDesignRequestUpdate).mock.calls[0]?.[0];
    expect(updateArg?.data.status).toBe(DesignRequestStatus.FAILED);
    expect(updateArg?.data.resultPayload.retryable).toBe(false);
    expect(updateArg?.data.errorCode).toBe("CANVA_INVALID_TEMPLATE");
    expect(txStatusEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toStatus: ContentStatus.DESIGN_FAILED,
        }),
      }),
    );
  });
});
