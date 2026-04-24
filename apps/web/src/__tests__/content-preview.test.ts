import { describe, expect, it } from "vitest";
import { getPublishedPreview } from "@/modules/content-catalog/application/content-preview";

describe("getPublishedPreview", () => {
  it("accepts data URLs from selected Nano Banana assets", () => {
    const preview = getPublishedPreview({
      planningSnapshot: {},
      assets: [
        {
          externalUrl: "data:image/png;base64,AAA",
        },
      ],
    });

    expect(preview).toEqual({
      previewUrl: "data:image/png;base64,AAA",
      referenceUrl: "data:image/png;base64,AAA",
      label: "Published visual",
    });
  });

  it("still accepts normal image URLs", () => {
    const preview = getPublishedPreview({
      planningSnapshot: {},
      assets: [
        {
          externalUrl: "https://example.com/image.png",
        },
      ],
    });

    expect(preview).toEqual({
      previewUrl: "https://example.com/image.png",
      referenceUrl: "https://example.com/image.png",
      label: "Published visual",
    });
  });
});
