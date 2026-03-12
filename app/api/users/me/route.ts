import { apiError, apiOk } from "../../../../lib/api-response";
import { ensureUserProfilesTable, getPool } from "../../../../lib/db";
import { readSession } from "../../../../lib/session";

type UpdateMeBody = {
  displayName?: string;
  timezone?: string;
};

type ProfileRow = {
  display_name: string | null;
  timezone: string;
};

export async function GET() {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  await ensureUserProfilesTable();
  const pool = getPool();
  const profileResult = await pool.query<ProfileRow>(
    "SELECT display_name, timezone FROM user_profiles WHERE username = $1 LIMIT 1",
    [username],
  );

  const row = profileResult.rows[0];

  return apiOk({
    username,
    profile: {
      displayName: row?.display_name ?? "",
      timezone: row?.timezone ?? "Asia/Seoul",
    },
  });
}

export async function PATCH(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as UpdateMeBody;
    const displayName = (body.displayName ?? "").trim();
    const timezone = (body.timezone ?? "Asia/Seoul").trim();

    if (displayName.length > 80) {
      return apiError({ status: 400, code: "INVALID_DISPLAY_NAME", message: "표시 이름은 80자 이하여야 합니다." });
    }

    if (timezone.length < 3 || timezone.length > 64) {
      return apiError({ status: 400, code: "INVALID_TIMEZONE", message: "시간대 값이 올바르지 않습니다." });
    }

    await ensureUserProfilesTable();
    const pool = getPool();
    await pool.query(
      `
        INSERT INTO user_profiles (username, display_name, timezone, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (username)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          timezone = EXCLUDED.timezone,
          updated_at = NOW()
      `,
      [username, displayName || null, timezone],
    );

    return apiOk({
      username,
      profile: {
        displayName,
        timezone,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로필 저장 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "PROFILE_UPDATE_FAILED", message });
  }
}
