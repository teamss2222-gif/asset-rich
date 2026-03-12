import { NextResponse } from "next/server";

type SuccessInit = {
  status?: number;
  code?: string;
  message?: string;
  traceId?: string;
};

type ErrorInit = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  traceId?: string;
};

function makeTraceId(input?: string) {
  return input ?? crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiOk<T>(data: T, init: SuccessInit = {}) {
  const traceId = makeTraceId(init.traceId);
  const reserved = new Set(["ok", "code", "message", "traceId", "timestamp", "data"]);
  const legacy = isRecord(data)
    ? Object.fromEntries(Object.entries(data).filter(([key]) => !reserved.has(key)))
    : {};

  return NextResponse.json(
    {
      ok: true,
      code: init.code ?? "OK",
      message: init.message ?? "success",
      traceId,
      timestamp: new Date().toISOString(),
      data,
      ...legacy,
    },
    { status: init.status ?? 200 },
  );
}

export function apiError(init: ErrorInit) {
  const traceId = makeTraceId(init.traceId);
  if (init.status >= 500) {
    console.error(`[API_ERROR] traceId=${traceId} code=${init.code} message=${init.message}`, init.details ?? null);
  }

  return NextResponse.json(
    {
      ok: false,
      code: init.code,
      message: init.message,
      traceId,
      timestamp: new Date().toISOString(),
      details: init.details ?? null,
    },
    { status: init.status },
  );
}
