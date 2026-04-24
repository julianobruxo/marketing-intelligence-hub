import { DesignProvider } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  canvaProvider: { name: "real-canva" },
  gptImageProvider: { name: "real-gpt-image" },
  nanoBananaProvider: { name: "real-nano-banana" },
  mockCanvaProvider: { name: "mock-canva" },
  mockGptImageProvider: { name: "mock-gpt-image" },
  mockNanaBananaProvider: { name: "mock-nano-banana" },
  mockDesignProvider: { name: "mock-design" },
}));

vi.mock("@/modules/design-orchestration/infrastructure/canva-provider", () => ({
  canvaProvider: providerMocks.canvaProvider,
}));

vi.mock("@/modules/design-orchestration/infrastructure/nano-banana-provider", () => ({
  nanoBananaProvider: providerMocks.nanoBananaProvider,
}));

vi.mock("@/modules/design-orchestration/infrastructure/gpt-image-provider", () => ({
  gptImageProvider: providerMocks.gptImageProvider,
}));

vi.mock("@/modules/design-orchestration/infrastructure/mock-canva-provider", () => ({
  mockCanvaProvider: providerMocks.mockCanvaProvider,
}));

vi.mock("@/modules/design-orchestration/infrastructure/mock-gpt-image-provider", () => ({
  mockGptImageProvider: providerMocks.mockGptImageProvider,
}));

vi.mock("@/modules/design-orchestration/infrastructure/mock-nano-banana-provider", () => ({
  mockNanaBananaProvider: providerMocks.mockNanaBananaProvider,
}));

vi.mock("@/modules/design-orchestration/infrastructure/mock-design-provider", () => ({
  mockDesignProvider: providerMocks.mockDesignProvider,
}));

function setProcessEnv(overrides: Record<string, string | undefined>) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

async function importRegistry() {
  vi.resetModules();
  return import("@/modules/design-orchestration/infrastructure/design-provider-registry");
}

describe("design-provider-registry", () => {
  let restoreEnv: (() => void) | null = null;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    vi.resetModules();
  });

  it("returns the mock Canva provider when CANVA_PROVIDER_MODE is MOCK", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      CANVA_PROVIDER_MODE: "MOCK",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.CANVA)).toBe(providerMocks.mockCanvaProvider);
  });

  it("returns the real Canva provider when CANVA_PROVIDER_MODE is REAL", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      CANVA_PROVIDER_MODE: "REAL",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.CANVA)).toBe(providerMocks.canvaProvider);
  });

  it("returns the mock Nano Banana provider when NB_PROVIDER_MODE is MOCK", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NB_PROVIDER_MODE: "MOCK",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.AI_VISUAL)).toBe(
      providerMocks.mockNanaBananaProvider,
    );
  });

  it("returns the mock GPT Image provider when GPT_IMAGE_PROVIDER_MODE is MOCK", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      GPT_IMAGE_PROVIDER_MODE: "MOCK",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.GPT_IMAGE)).toBe(
      providerMocks.mockGptImageProvider,
    );
  });

  it("returns the real GPT Image provider when GPT_IMAGE_PROVIDER_MODE is REAL", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      GPT_IMAGE_PROVIDER_MODE: "REAL",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.GPT_IMAGE)).toBe(
      providerMocks.gptImageProvider,
    );
  });

  it("returns the real Nano Banana provider when NB_PROVIDER_MODE is REAL", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NB_PROVIDER_MODE: "REAL",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.AI_VISUAL)).toBe(
      providerMocks.nanoBananaProvider,
    );
  });

  it("returns the generic mock provider for MANUAL", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
    });

    const { getDesignExecutionProvider } = await importRegistry();
    expect(getDesignExecutionProvider(DesignProvider.MANUAL)).toBe(providerMocks.mockDesignProvider);
  });

  it("throws on an unknown provider type", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
    });

    const { getDesignExecutionProvider } = await importRegistry();

    expect(() => getDesignExecutionProvider("UNKNOWN" as never)).toThrow(
      "Unknown provider type: UNKNOWN",
    );
  });
});
