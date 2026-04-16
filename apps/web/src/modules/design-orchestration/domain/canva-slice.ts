import { ContentProfile, ContentType } from "@prisma/client";

export const CANVA_SLICE_V1 = {
  profile: ContentProfile.YANN,
  contentType: ContentType.STATIC_POST,
  locale: "en",
  templateFamily: "Yann Static English",
  datasetFields: {
    title: "TITLE",
    body: "BODY",
  },
} as const;

export function isSliceOneCanvaEligible(input: {
  profile: ContentProfile;
  contentType: ContentType;
  sourceLocale: string;
}) {
  return (
    input.profile === CANVA_SLICE_V1.profile &&
    input.contentType === CANVA_SLICE_V1.contentType &&
    input.sourceLocale === CANVA_SLICE_V1.locale
  );
}
