import { apiError, apiOk } from "../../../lib/api-response";

type ContactPayload = {
  name?: string;
  email?: string;
  message?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ContactPayload | null;

  if (!body) {
    return apiError({ status: 400, code: "EMPTY_BODY", message: "요청 본문이 비어 있습니다." });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (name.length < 2) {
    return apiError({ status: 400, code: "INVALID_NAME", message: "이름은 2자 이상이어야 합니다." });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return apiError({ status: 400, code: "INVALID_EMAIL", message: "올바른 이메일 형식이 아닙니다." });
  }

  if (message.length < 10) {
    return apiError({ status: 400, code: "INVALID_MESSAGE", message: "메시지는 10자 이상 입력해 주세요." });
  }

  const successMessage = "문의가 접수되었습니다. 빠르게 확인 후 연락드릴게요.";
  return apiOk(
    {
      message: successMessage,
      receivedAt: new Date().toISOString(),
    },
    { status: 200, code: "CONTACT_ACCEPTED", message: successMessage },
  );
}
