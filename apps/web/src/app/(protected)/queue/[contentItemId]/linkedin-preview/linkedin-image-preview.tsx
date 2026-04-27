"use client";

import { useState } from "react";

type Props = {
  assetUrl: string;
};

export function LinkedInImagePreview({ assetUrl }: Props) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 py-8 px-4"
        style={{ borderTop: "1px solid rgba(0,0,0,0.08)", backgroundColor: "#F3F2EF" }}
      >
        <p className="text-sm" style={{ color: "rgba(0,0,0,0.4)" }}>
          Image preview could not be loaded
        </p>
        {!assetUrl.startsWith("data:") && (
          <a
            href={assetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs hover:underline"
            style={{ color: "#0A66C2" }}
          >
            Open image
          </a>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl}
        alt="Post image"
        style={{
          width: "100%",
          maxHeight: "600px",
          objectFit: "contain",
          backgroundColor: "#000",
          display: "block",
        }}
        onError={() => setError(true)}
      />
    </div>
  );
}
