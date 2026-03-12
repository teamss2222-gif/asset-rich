import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";
import { getSupabaseClient } from "../../../../lib/supabase";

type PresignedUrlBody = {
  fileName?: string;
  contentType?: string;
};

export async function POST(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as PresignedUrlBody;
    const fileName = (body.fileName ?? "").trim();
    const contentType = (body.contentType ?? "application/octet-stream").trim();

    if (!fileName) {
      return apiError({ status: 400, code: "FILE_NAME_REQUIRED", message: "파일명이 필요합니다." });
    }

    if (fileName.length > 160) {
      return apiError({ status: 400, code: "FILE_NAME_TOO_LONG", message: "파일명이 너무 깁니다." });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${username}/${Date.now()}_${safeName}`;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage.from("uploads").createSignedUploadUrl(path);

    if (error) {
      return apiError({ status: 500, code: "SIGNED_URL_FAILED", message: error.message });
    }

    const { data: publicUrlData } = supabase.storage.from("uploads").getPublicUrl(path);

    return apiOk({
      path,
      token: data?.token ?? null,
      signedUrl: data?.signedUrl ?? null,
      publicUrl: publicUrlData.publicUrl,
      contentType,
      expiresInSeconds: 7200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "업로드 URL 생성 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "SIGNED_URL_FAILED", message });
  }
}
