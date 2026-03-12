import { apiError, apiOk } from "../../../../lib/api-response";
import { readSession } from "../../../../lib/session";

type LookupBody = {
  address?: string;
};

const SEOUL_LAWD_BY_GU: Record<string, string> = {
  "종로구": "11110",
  "중구": "11140",
  "용산구": "11170",
  "성동구": "11200",
  "광진구": "11215",
  "동대문구": "11230",
  "중랑구": "11260",
  "성북구": "11290",
  "강북구": "11305",
  "도봉구": "11320",
  "노원구": "11350",
  "은평구": "11380",
  "서대문구": "11410",
  "마포구": "11440",
  "양천구": "11470",
  "강서구": "11500",
  "구로구": "11530",
  "금천구": "11545",
  "영등포구": "11560",
  "동작구": "11590",
  "관악구": "11620",
  "서초구": "11650",
  "강남구": "11680",
  "송파구": "11710",
  "강동구": "11740",
};

const GYEONGGI_LAWD_BY_SIGUN: Record<string, string> = {
  "수원시": "41110",
  "성남시": "41130",
  "의정부시": "41150",
  "안양시": "41170",
  "부천시": "41190",
  "광명시": "41210",
  "평택시": "41220",
  "동두천시": "41250",
  "안산시": "41270",
  "고양시": "41280",
  "과천시": "41290",
  "구리시": "41310",
  "남양주시": "41360",
  "오산시": "41370",
  "시흥시": "41390",
  "군포시": "41410",
  "의왕시": "41430",
  "하남시": "41450",
  "용인시": "41460",
  "파주시": "41480",
  "이천시": "41500",
  "안성시": "41550",
  "김포시": "41570",
  "화성시": "41590",
  "광주시": "41610",
  "양주시": "41630",
  "포천시": "41650",
  "여주시": "41670",
  "연천군": "41800",
  "가평군": "41820",
  "양평군": "41830",
};

function findLawdCodeByAddress(address: string) {
  const isGyeonggiAddress = address.includes("경기도");

  if (isGyeonggiAddress) {
    for (const [sigun, lawdCode] of Object.entries(GYEONGGI_LAWD_BY_SIGUN)) {
      if (address.includes(sigun)) {
        return { lawdCode, matchedAddress: `경기도 ${sigun}` };
      }
    }
  }

  for (const [gu, lawdCode] of Object.entries(SEOUL_LAWD_BY_GU)) {
    if (address.includes(gu)) {
      return { lawdCode, matchedAddress: `서울특별시 ${gu}` };
    }
  }

  // 도/광역시 접두어가 없어도 시/군 이름으로 경기권 추론
  for (const [sigun, lawdCode] of Object.entries(GYEONGGI_LAWD_BY_SIGUN)) {
    if (address.includes(sigun)) {
      return { lawdCode, matchedAddress: `경기도 ${sigun}` };
    }
  }

  return null;
}

function stripTag(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return (match?.[1] ?? "").trim();
}

type LawdItem = {
  regionCode: string;
  addressName: string;
};

function parseLawdItems(xml: string): LawdItem[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return items.flatMap((item) => {
    const regionCode = stripTag(item, "region_cd") || stripTag(item, "regionCode");
    const addressName = stripTag(item, "locatadd_nm") || stripTag(item, "locataddNm");

    if (!regionCode || !addressName) {
      return [];
    }

    return [{ regionCode, addressName }];
  });
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/\s/g, "");
}

export async function POST(request: Request) {
  const username = await readSession();
  if (!username) {
    return apiError({ status: 401, code: "UNAUTHORIZED", message: "로그인이 필요합니다." });
  }

  try {
    const body = (await request.json()) as LookupBody;
    const address = (body.address ?? "").trim();
    if (address.length < 2) {
      return apiError({ status: 400, code: "INVALID_ADDRESS", message: "주소를 2자 이상 입력해 주세요." });
    }

    // 1) Key 없이 바로 가능한 내장 매핑(서울 25개 구)
    const fallback = findLawdCodeByAddress(address);
    if (fallback) {
      return apiOk({
        lawdCode: fallback.lawdCode,
        matchedAddress: fallback.matchedAddress,
        source: "내장 매핑(서울 자치구)",
      });
    }

    // 2) 내장 매핑 실패 시 외부 API 조회
    const serviceKey = process.env.REAL_ESTATE_LAWD_API_KEY || process.env.REAL_ESTATE_API_KEY;
    if (!serviceKey) {
      return apiError({
        status: 400,
        code: "LAWDCODE_API_KEY_REQUIRED",
        message:
          "주소 자동코드 찾기는 서울 주소만 키 없이 지원됩니다. 그 외 지역은 REAL_ESTATE_LAWD_API_KEY 또는 REAL_ESTATE_API_KEY를 설정해 주세요.",
      });
    }

    const endpoint =
      "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList" +
      `?serviceKey=${serviceKey}` +
      "&type=xml&pageNo=1&numOfRows=100&flag=Y" +
      `&locatadd_nm=${encodeURIComponent(address)}`;

    const response = await fetch(endpoint, { cache: "no-store" });
    const xml = await response.text();

    if (!response.ok) {
      return apiError({ status: 502, code: "LAWDCODE_UPSTREAM_FAILED", message: "법정동코드 API 호출에 실패했습니다." });
    }

    const items = parseLawdItems(xml);
    if (items.length === 0) {
      return apiError({ status: 404, code: "LAWDCODE_NOT_FOUND", message: "주소로 조회된 법정동 데이터가 없습니다." });
    }

    const target = normalizeText(address);
    const sorted = [...items].sort((a, b) => {
      const aNorm = normalizeText(a.addressName);
      const bNorm = normalizeText(b.addressName);
      const aScore = aNorm.includes(target) ? 2 : target.includes(aNorm) ? 1 : 0;
      const bScore = bNorm.includes(target) ? 2 : target.includes(bNorm) ? 1 : 0;

      if (aScore !== bScore) {
        return bScore - aScore;
      }

      return b.addressName.length - a.addressName.length;
    });

    const match = sorted[0];
    const lawdCode = match.regionCode.slice(0, 5);

    return apiOk({
      lawdCode,
      fullRegionCode: match.regionCode,
      matchedAddress: match.addressName,
      source: "행정표준코드관리시스템",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "법정동코드 조회 중 오류가 발생했습니다.";
    return apiError({ status: 500, code: "LAWDCODE_LOOKUP_FAILED", message });
  }
}
