export type ApiEnvelope<T> = {
  ok?: boolean;
  code?: string;
  message?: string;
  traceId?: string;
  timestamp?: string;
  data?: T;
};

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  message: string;
  traceId: string | null;
  data: T;
  raw: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unwrapApiData<T>(raw: unknown): T {
  if (isRecord(raw) && "data" in raw) {
    return raw.data as T;
  }

  return raw as T;
}

export function extractApiMessage(raw: unknown, fallback: string) {
  if (isRecord(raw) && typeof raw.message === "string" && raw.message.trim()) {
    return raw.message;
  }

  return fallback;
}

export function extractApiTraceId(raw: unknown) {
  if (isRecord(raw) && typeof raw.traceId === "string" && raw.traceId.trim()) {
    return raw.traceId;
  }

  return null;
}

export async function requestApi<T>(input: RequestInfo | URL, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(input, init);
  let raw: unknown = null;

  try {
    raw = (await response.json()) as unknown;
  } catch {
    raw = null;
  }

  const fallbackMessage = response.ok ? "요청이 완료되었습니다." : "요청 처리에 실패했습니다.";

  return {
    ok: response.ok,
    status: response.status,
    message: extractApiMessage(raw, fallbackMessage),
    traceId: extractApiTraceId(raw),
    data: unwrapApiData<T>(raw),
    raw,
  };
}
