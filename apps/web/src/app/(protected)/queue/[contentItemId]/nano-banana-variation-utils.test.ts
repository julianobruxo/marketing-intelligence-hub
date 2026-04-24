import { describe, expect, it } from "vitest";
import {
  extractNanaBananaVariations,
  extractSelectedVariationId,
} from "./nano-banana-variation-utils";

describe("nano-banana-variation-utils", () => {
  it("extracts variations from Nano Banana result payloads", () => {
    const variations = extractNanaBananaVariations({
      nanoBanana: {
        variations: [
          {
            id: "nb-v1",
            label: "Variation 1",
            dataUrl: "data:image/png;base64,aGVsbG8=",
            thumbnailUrl: "https://example.com/nb-v1.png",
            editUrl: "https://example.com/nb-v1/edit",
          },
          {
            id: "nb-v2",
            label: "Variation 2",
            thumbnailUrl: "https://example.com/nb-v2.png",
            editUrl: "https://example.com/nb-v2/edit",
          },
        ],
      },
    });

    expect(variations).toHaveLength(2);
    expect(variations[0]).toMatchObject({
      id: "nb-v1",
      thumbnailUrl: "data:image/png;base64,aGVsbG8=",
    });
  });

  it("extracts variations from GPT Image result payloads", () => {
    const variations = extractNanaBananaVariations({
      gptImage: {
        variations: [
          {
            id: "gpt-v1",
            label: "Variation 1",
            thumbnailUrl: "https://example.com/gpt-v1.png",
            editUrl: "https://example.com/gpt-v1/edit",
          },
        ],
      },
    });

    expect(variations).toHaveLength(1);
    expect(variations[0]?.id).toBe("gpt-v1");
  });

  it("extracts operator selection from asset metadata or selectedVariation payload", () => {
    expect(extractSelectedVariationId({ selectedVariationId: "asset-v2" })).toBe("asset-v2");
    expect(extractSelectedVariationId({ selectedVariation: { id: "payload-v3" } })).toBe("payload-v3");
  });

  it("does not treat unselected generated variations as an operator selection", () => {
    expect(
      extractSelectedVariationId({
        nanoBanana: {
          selectedVariationId: "provider-default-v1",
        },
      }),
    ).toBeNull();
  });
});
