import { NextResponse } from "next/server";

type ContactPayload = {
  name?: string;
  email?: string;
  message?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as ContactPayload | null;

  if (!body) {
    return NextResponse.json({ message: "요청 본문이 비어 있습니다." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (name.length < 2) {
    return NextResponse.json({ message: "이름은 2자 이상이어야 합니다." }, { status: 400 });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ message: "올바른 이메일 형식이 아닙니다." }, { status: 400 });
  }

  if (message.length < 10) {
    return NextResponse.json({ message: "메시지는 10자 이상 입력해 주세요." }, { status: 400 });
  }

  return NextResponse.json(
    {
      message: "문의가 접수되었습니다. 빠르게 확인 후 연락드릴게요.",
      receivedAt: new Date().toISOString(),
    },
    { status: 200 },
  );
}
