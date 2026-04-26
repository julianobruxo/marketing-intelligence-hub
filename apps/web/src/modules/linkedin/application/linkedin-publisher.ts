import type { AssetType, PublishLanguage } from "@prisma/client";

export type LinkedInPublishInput = {
  targetOwnerName: string;
  targetLabel: string;
  targetType: string;
  targetConnectionStatus: string;
  selectedPublishLanguage: PublishLanguage;
  copySnapshot: string;
  assetType: AssetType | null;
  assetUrl: string | null;
  assetSnapshot: Record<string, unknown> | null;
};

export type LinkedInPublishResult = {
  ok: true;
  linkedinPostUrn: string | null;
  linkedinPostUrl: string | null;
} | {
  ok: false;
  errorMessage: string;
};

export interface LinkedInPublisher {
  publish(input: LinkedInPublishInput): Promise<LinkedInPublishResult>;
}

export class MockLinkedInPublisher implements LinkedInPublisher {
  async publish(input: LinkedInPublishInput): Promise<LinkedInPublishResult> {
    const mockUrn = `urn:li:share:mock-${Date.now()}`;
    const mockUrl = `https://www.linkedin.com/feed/update/${mockUrn}/`;

    console.log("[MockLinkedInPublisher] Mock publish for target:", input.targetOwnerName, {
      language: input.selectedPublishLanguage,
      assetType: input.assetType,
      copyLength: input.copySnapshot.length,
    });

    return {
      ok: true,
      linkedinPostUrn: mockUrn,
      linkedinPostUrl: mockUrl,
    };
  }
}
