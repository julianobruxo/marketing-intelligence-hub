import { CANVA_API_KEY, CANVA_API_URL } from "@/shared/config/env";

type CanvaTextValue = {
  type: "text";
  text: string;
};

export type CanvaAutofillJobSummary =
  | {
      status: "IN_PROGRESS";
      jobId: string;
      raw: unknown;
    }
  | {
      status: "SUCCESS";
      jobId: string;
      designUrl: string;
      thumbnailUrl: string | null;
      raw: unknown;
    }
  | {
      status: "FAILED";
      jobId: string;
      errorCode: string;
      errorMessage: string;
      raw: unknown;
    };

type CanvaApiErrorBody = {
  code?: string;
  message?: string;
};

export class CanvaApiError extends Error {
  status: number;
  code: string | null;
  body: unknown;

  constructor(message: string, input: { status: number; code?: string | null; body?: unknown }) {
    super(message);
    this.name = "CanvaApiError";
    this.status = input.status;
    this.code = input.code ?? null;
    this.body = input.body;
  }
}

export class CanvaTransportError extends Error {
  causeError: unknown;

  constructor(message: string, causeError: unknown) {
    super(message);
    this.name = "CanvaTransportError";
    this.causeError = causeError;
  }
}

function getCanvaConfig() {
  if (!CANVA_API_URL || !CANVA_API_KEY) {
    throw new Error("Canva credentials are not configured.");
  }

  return {
    baseUrl: CANVA_API_URL.replace(/\/$/, ""),
    accessToken: CANVA_API_KEY,
  };
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error instanceof CanvaApiError
        ? { status: error.status, code: error.code }
        : error instanceof CanvaTransportError
          ? { cause: String(error.causeError) }
          : {}),
    };
  }

  return { message: String(error) };
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function canvaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const config = getCanvaConfig();

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      const errorBody = body as CanvaApiErrorBody | null;
      throw new CanvaApiError(
        errorBody?.message ??
          `Canva API request failed with status ${response.status} for ${path}.`,
        {
          status: response.status,
          code: errorBody?.code ?? null,
          body,
        },
      );
    }

    return body as T;
  } catch (error) {
    if (!(error instanceof CanvaApiError)) {
      console.error("[canva-client] request failed", {
        path,
        method: init?.method ?? "GET",
        error: serializeError(error),
      });

      throw new CanvaTransportError(
        `Canva request failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    console.error("[canva-client] API error", {
      path,
      method: init?.method ?? "GET",
      status: error.status,
      code: error.code,
      error: serializeError(error),
    });

    throw error;
  }
}

function toAutofillData(fieldMappings: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(fieldMappings).map(([key, value]) => [
      key,
      {
        type: "text" as const,
        text: value,
      } satisfies CanvaTextValue,
    ]),
  );
}

function extractString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractCanvaJobId(rawBody: unknown): string {
  const body = asRecord(rawBody);
  const job = asRecord(body?.job);
  const jobId = extractString(job?.id) ?? extractString(body?.requestId) ?? extractString(body?.id);

  if (!jobId) {
    throw new Error("Canva API returned a response without a job id.");
  }

  return jobId;
}

function extractCanvaJobSummary(rawBody: unknown): CanvaAutofillJobSummary {
  const body = asRecord(rawBody);
  const job = asRecord(body?.job) ?? body;
  const jobId = extractString(job?.id) ?? extractString(body?.requestId) ?? extractString(body?.id);

  if (!jobId) {
    throw new Error("Canva API returned a response without a job id.");
  }

  const statusRaw =
    extractString(job?.status)?.toLowerCase() ??
    extractString(body?.status)?.toLowerCase() ??
    "in_progress";

  if (statusRaw === "in_progress") {
    return {
      status: "IN_PROGRESS",
      jobId,
      raw: rawBody,
    };
  }

  if (statusRaw === "success") {
    const result = asRecord(job?.result) ?? asRecord(body?.result);
    const design = asRecord(result?.design);
    const urls = asRecord(design?.urls);
    const thumbnail = asRecord(design?.thumbnail);
    const designUrl =
      extractString(urls?.edit_url) ??
      extractString(design?.url) ??
      extractString(urls?.view_url) ??
      extractString(design?.edit_url);
    const thumbnailUrl =
      extractString(thumbnail?.url) ??
      extractString(design?.thumbnail_url) ??
      null;

    if (!designUrl) {
      throw new Error("Canva API returned a successful job without a design URL.");
    }

    return {
      status: "SUCCESS",
      jobId,
      designUrl,
      thumbnailUrl,
      raw: rawBody,
    };
  }

  const error = asRecord(job?.error) ?? asRecord(body?.error) ?? {};
  const errorCode = extractString(error.code) ?? "autofill_error";
  const errorMessage =
    extractString(error.message) ?? `Canva autofill job ${jobId} failed with status ${statusRaw}.`;

  return {
    status: "FAILED",
    jobId,
    errorCode,
    errorMessage,
    raw: rawBody,
  };
}

export async function submitAutofill(input: {
  templateId: string;
  fieldMappings: Record<string, string>;
}) {
  const rawBody = await canvaRequest<unknown>("/autofills", {
    method: "POST",
    body: JSON.stringify({
      brand_template_id: input.templateId,
      data: toAutofillData(input.fieldMappings),
    }),
  });

  return {
    job: {
      id: extractCanvaJobId(rawBody),
    },
  };
}

export async function checkAutofillJob(jobId: string): Promise<CanvaAutofillJobSummary> {
  const rawBody = await canvaRequest<unknown>(`/autofills/${jobId}`, {
    method: "GET",
  });

  return extractCanvaJobSummary(rawBody);
}

export async function getBrandTemplateDataset(brandTemplateId: string) {
  return canvaRequest<unknown>(`/brand-templates/${brandTemplateId}/dataset`, {
    method: "GET",
  });
}

export async function createAutofillJob(
  templateId: string,
  data: Record<string, CanvaTextValue>,
) {
  return canvaRequest<unknown>("/autofills", {
    method: "POST",
    body: JSON.stringify({
      brand_template_id: templateId,
      data,
    }),
  });
}

export async function getAutofillJob(jobId: string) {
  return checkAutofillJob(jobId);
}
