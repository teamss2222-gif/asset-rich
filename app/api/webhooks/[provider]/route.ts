import { apiError, apiOk } from "../../../../lib/api-response";
import { ensureWebhookEventsTable, getPool } from "../../../../lib/db";

type WebhookInsertResult = {
  id: number;
};

function parseProvider(input: string) {
  const provider = input.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,30}$/.test(provider)) {
    return null;
  }
  return provider;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const resolvedParams = await params;
  const provider = parseProvider(resolvedParams.provider);

  if (!provider) {
    return apiError({ status: 400, code: "INVALID_PROVIDER", message: "provider 값이 올바르지 않습니다." });
  }

  const rawBody = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return apiError({ status: 400, code: "INVALID_JSON", message: "웹훅 본문 JSON 파싱에 실패했습니다." });
  }

  const sharedSecret = process.env.WEBHOOK_SHARED_SECRET?.trim();
  const incomingSignature = request.headers.get("x-webhook-signature")?.trim() ?? "";
  const signatureValid = !sharedSecret || incomingSignature === sharedSecret;

  if (!signatureValid) {
    return apiError({ status: 401, code: "INVALID_SIGNATURE", message: "웹훅 서명이 올바르지 않습니다." });
  }

  const deliveryId =
    request.headers.get("x-delivery-id")?.trim() ||
    request.headers.get("x-request-id")?.trim() ||
    null;
  const eventType = request.headers.get("x-event-type")?.trim() ||
    (typeof payload.type === "string" ? payload.type : null);

  await ensureWebhookEventsTable();
  const pool = getPool();

  let inserted = false;
  let eventId: number | null = null;
  if (deliveryId) {
    const result = await pool.query<WebhookInsertResult>(
      `
        INSERT INTO webhook_events (provider, delivery_id, event_type, signature_valid, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (provider, delivery_id) DO NOTHING
        RETURNING id
      `,
      [provider, deliveryId, eventType, signatureValid, JSON.stringify(payload)],
    );

    inserted = (result.rowCount ?? 0) > 0;
    eventId = result.rows[0]?.id ?? null;
  } else {
    const result = await pool.query<WebhookInsertResult>(
      `
        INSERT INTO webhook_events (provider, delivery_id, event_type, signature_valid, payload)
        VALUES ($1, NULL, $2, $3, $4::jsonb)
        RETURNING id
      `,
      [provider, eventType, signatureValid, JSON.stringify(payload)],
    );

    inserted = true;
    eventId = result.rows[0]?.id ?? null;
  }

  return apiOk(
    {
      accepted: true,
      duplicate: deliveryId ? !inserted : false,
      provider,
      deliveryId,
      eventType,
      eventId,
    },
    { status: 202, code: "WEBHOOK_ACCEPTED", message: "webhook accepted" },
  );
}
