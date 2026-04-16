import { env } from "@/shared/config/env";

type CanvaTextValue = {
  type: "text";
  text: string;
};

type CanvaDatasetResponse = {
  dataset?: {
    fields?: Array<{
      name?: string;
      type?: string;
    }>;
  };
};

type CanvaAutofillJobResponse = {
  job?: {
    id?: string;
    status?: string;
    result?: {
      design_id?: string;
      edit_url?: string;
      thumbnail_url?: string;
    };
    error?: {
      code?: string;
      message?: string;
    };
  };
};

function getCanvaConfig() {
  if (!env.CANVA_API_BASE_URL || !env.CANVA_ACCESS_TOKEN) {
    throw new Error("Canva credentials are not configured.");
  }

  return {
    baseUrl: env.CANVA_API_BASE_URL.replace(/\/$/, ""),
    accessToken: env.CANVA_ACCESS_TOKEN,
  };
}

async function canvaFetch<T>(path: string, init?: RequestInit) {
  const config = getCanvaConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Canva API request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function getBrandTemplateDataset(brandTemplateId: string) {
  return canvaFetch<CanvaDatasetResponse>(`/v1/brand-templates/${brandTemplateId}/dataset`, {
    method: "GET",
  });
}

export async function createAutofillJob(
  brandTemplateId: string,
  data: Record<string, CanvaTextValue>,
) {
  return canvaFetch<CanvaAutofillJobResponse>("/v1/autofills", {
    method: "POST",
    body: JSON.stringify({
      brand_template_id: brandTemplateId,
      data,
    }),
  });
}

export async function getAutofillJob(jobId: string) {
  return canvaFetch<CanvaAutofillJobResponse>(`/v1/autofills/${jobId}`, {
    method: "GET",
  });
}
