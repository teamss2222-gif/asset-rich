import { apiError, apiOk } from "../../../lib/api-response";
import { getSupabaseClient } from "../../../lib/supabase";
import { readSession } from "../../../lib/session";

export async function POST(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return apiError({ status: 400, code: "FILE_REQUIRED", message: "파일이 없습니다." });
  }

  if (file.size > 10 * 1024 * 1024) {
    return apiError({ status: 400, code: "FILE_TOO_LARGE", message: "파일 크기는 10MB 이하여야 합니다." });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${username}/${Date.now()}_${safeName}`;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from("uploads")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    return apiError({ status: 500, code: "UPLOAD_FAILED", message: error.message });
  }

  const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(data.path);

  return apiOk({ url: urlData.publicUrl, path: data.path }, { code: "UPLOAD_OK", message: "upload success" });
}
