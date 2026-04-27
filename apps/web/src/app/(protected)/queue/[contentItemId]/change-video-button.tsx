"use client";

import { useState } from "react";
import { VideoUploadPanel } from "./video-upload-panel";

type Props = {
  contentItemId: string;
  existingVideoUrl: string | null;
};

export function ChangeVideoButton({ contentItemId, existingVideoUrl }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition dark:border-[rgba(255,255,255,0.1)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(255,255,255,0.85)] dark:hover:bg-[rgba(255,255,255,0.12)]"
      >
        Change video link
      </button>
      {open && (
        <VideoUploadPanel
          contentItemId={contentItemId}
          existingVideoUrl={existingVideoUrl}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
