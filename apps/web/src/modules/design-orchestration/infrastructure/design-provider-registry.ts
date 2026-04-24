/**
 * Design Provider Registry
 *
 * Single place that decides whether the app should use a real adapter or the
 * mock fallback for a given design provider.
 */

import { DesignProvider } from "@prisma/client";
import { CANVA_PROVIDER_MODE, GPT_IMAGE_PROVIDER_MODE, NB_PROVIDER_MODE } from "@/shared/config/env";
import type { DesignExecutionProvider } from "../domain/design-provider";
import { canvaProvider } from "./canva-provider";
import { gptImageProvider } from "./gpt-image-provider";
import { nanoBananaProvider } from "./nano-banana-provider";
import { mockCanvaProvider } from "./mock-canva-provider";
import { mockGptImageProvider } from "./mock-gpt-image-provider";
import { mockNanaBananaProvider } from "./mock-nano-banana-provider";
import { mockDesignProvider } from "./mock-design-provider";

export function getDesignExecutionProvider(
  provider?: DesignProvider | null,
): DesignExecutionProvider {
  if (provider === DesignProvider.CANVA) {
    return CANVA_PROVIDER_MODE === "REAL" ? canvaProvider : mockCanvaProvider;
  }

  if (provider === DesignProvider.GPT_IMAGE) {
    return GPT_IMAGE_PROVIDER_MODE === "REAL" ? gptImageProvider : mockGptImageProvider;
  }

  if (provider === DesignProvider.AI_VISUAL) {
    return NB_PROVIDER_MODE === "REAL" ? nanoBananaProvider : mockNanaBananaProvider;
  }

  if (provider == null || provider === DesignProvider.MANUAL) {
    return mockDesignProvider;
  }

  throw new Error(`Unknown provider type: ${provider}`);
}

/**
 * @deprecated Use getDesignExecutionProvider() with an explicit provider arg.
 */
export function getCanvaDesignExecutionProvider(): DesignExecutionProvider {
  return getDesignExecutionProvider(DesignProvider.CANVA);
}
