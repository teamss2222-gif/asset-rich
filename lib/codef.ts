import crypto from "crypto";

/* ══════════════════════════════════════════
   CODEF API Client
   https://developer.codef.io
   ══════════════════════════════════════════ */

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";
const CODEF_API_BASE = process.env.CODEF_USE_SANDBOX === "true"
  ? "https://development.codef.io"
  : "https://api.codef.io";

const PUBLIC_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3OjtRAr/i/HDv3fRFjay" +
  "5nEMSNt2WRbSAf2KpjzBTBESY/lnDY2SIfqUvzh3uVBCGc/BVfb+didFpei/EqWn" +
  "6yVE9fgOB1n8u0aQXXaKoO6yVKPKve6tUy3O6yZIWtk7N8Q3XfwX8Qeh7X+u5Es" +
  "fGAHcY9RDId+9oc9F/Q2oVqvSMB/9sw4s7tm5ZPUA4a7xjjLQQJErMsaP9h1M+/" +
  "CL3WyOHHAWznjUHiSKWTkx7HBxjhU/911NOSzmyMVKGYaxX3ScnTiJ1S0kyhXz5S" +
  "RWV3BNTOjGTfh31oLTAIGtsa352/irgYJYnv1viFHGDStGFfxtQH1XkOcCjnDFey" +
  "qt9QIDAQAB";

/* ── RSA 암호화 (비밀번호 등 민감정보) ── */
export function encryptRSA(plainText: string): string {
  const pubKey = `-----BEGIN PUBLIC KEY-----\n${PUBLIC_KEY}\n-----END PUBLIC KEY-----`;
  const encrypted = crypto.publicEncrypt(
    { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(plainText, "utf-8"),
  );
  return encrypted.toString("base64");
}

/* ── OAuth2 토큰 발급 ── */
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.CODEF_CLIENT_ID;
  const clientSecret = process.env.CODEF_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CODEF_CLIENT_ID / CODEF_CLIENT_SECRET 미설정");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(CODEF_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`CODEF 토큰 발급 실패: ${res.status}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 만료 1분 전 갱신
  };

  return cachedToken.token;
}

/* ── API 호출 ── */
export async function codefRequest<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ code: string; message: string; data: T }> {
  const token = await getAccessToken();

  const res = await fetch(`${CODEF_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`CODEF API 오류: ${res.status}`);
  }

  const text = await res.text();
  // CODEF 응답은 URL-encoded JSON인 경우가 있음
  const decoded = decodeURIComponent(text);
  const result = JSON.parse(decoded);

  return {
    code: result.result?.code ?? "",
    message: result.result?.message ?? "",
    data: result.data as T,
  };
}

/* ── 커넥티드 아이디 생성 ── */
export async function createConnectedId(
  accountList: {
    countryCode: string;
    businessType: string;
    clientType: string;
    organization: string;
    loginType: string;
    id: string;
    password: string; // 평문 → 내부에서 RSA 암호화
  }[],
): Promise<string> {
  const encrypted = accountList.map((a) => ({
    ...a,
    password: encryptRSA(a.password),
  }));

  const result = await codefRequest<{ connectedId: string }>(
    "/v1/account/create",
    { accountList: encrypted },
  );

  if (result.code !== "CF-00000") {
    throw new Error(`connectedId 생성 실패: ${result.code} ${result.message}`);
  }

  return result.data.connectedId;
}

/* ── 계정 추가 (기존 connectedId에) ── */
export async function addAccount(
  connectedId: string,
  accountList: {
    countryCode: string;
    businessType: string;
    clientType: string;
    organization: string;
    loginType: string;
    id: string;
    password: string;
  }[],
) {
  const encrypted = accountList.map((a) => ({
    ...a,
    password: encryptRSA(a.password),
  }));

  return codefRequest("/v1/account/add", { connectedId, accountList: encrypted });
}

/* ── 보유계좌 조회 ── */
export async function getAccountList(connectedId: string, organization: string) {
  return codefRequest("/v1/kr/bank/p/account/account-list", {
    connectedId,
    organization,
    birthDate: "",
    inquiryType: "0",
  });
}

/* ── 계좌 거래내역 조회 ── */
export async function getTransactions(
  connectedId: string,
  organization: string,
  account: string,
  startDate: string, // YYYYMMDD
  endDate: string,
) {
  return codefRequest("/v1/kr/bank/p/account/transaction-list", {
    connectedId,
    organization,
    account,
    startDate,
    endDate,
    orderBy: "0",
    inquiryType: "1",
  });
}
