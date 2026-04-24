import { describe, expect, it } from "vitest";
import { extractNanaBananaVariations } from "@/app/(protected)/queue/[contentItemId]/nano-banana-variation-utils";

describe("extractNanaBananaVariations", () => {
  it("prefers dataUrl when present so the chooser can render without a live store", () => {
    const variations = extractNanaBananaVariations({
      nanoBanana: {
        variations: [
          {
            id: "v1",
            label: "Variation 1",
            dataUrl: "data:image/png;base64,AAA",
            thumbnailUrl: "/api/design-orchestration/nano-banana/results/request-1/v1",
            editUrl: "/api/design-orchestration/nano-banana/results/request-1/v1",
          },
        ],
      },
    });

    expect(variations).toHaveLength(1);
    expect(variations[0]).toMatchObject({
      id: "v1",
      label: "Variation 1",
      thumbnailUrl: "data:image/png;base64,AAA",
      editUrl: "/api/design-orchestration/nano-banana/results/request-1/v1",
    });
  });

  it("falls back to thumbnailUrl for legacy payloads", () => {
    const variations = extractNanaBananaVariations({
      nanoBanana: {
        variations: [
          {
            id: "v1",
            label: "Variation 1",
            thumbnailUrl: "https://example.com/v1.png",
            editUrl: "https://example.com/v1/edit",
          },
        ],
      },
    });

    expect(variations).toHaveLength(1);
    expect(variations[0]).toMatchObject({
      id: "v1",
      thumbnailUrl: "https://example.com/v1.png",
      editUrl: "https://example.com/v1/edit",
    });
  });
});
