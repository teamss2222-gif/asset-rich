# Asset Lab

Next.js 16 + TypeScript 기반의 초기 프로젝트입니다.

## 실행 방법

```bash
npm install
npm run dev
```

- 기본 주소: `http://localhost:3000`
- 포트 충돌 시 Next.js가 자동으로 다음 포트를 사용합니다.

## 주요 스크립트

```bash
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드
npm run start   # 빌드 결과 실행
npm run lint    # 린트 검사
```

## 구조

- `app/layout.tsx`: 전역 레이아웃, 메타데이터, 폰트 설정
- `app/page.tsx`: 랜딩 페이지 UI
- `app/globals.css`: 전역 스타일, 색상 변수, 애니메이션
- `app/api/health/route.ts`: 헬스체크 API
- `app/api/contact/route.ts`: 문의 폼 API
- `app/ui/contact-form.tsx`: 클라이언트 문의 폼 컴포넌트

## API 테스트

```bash
curl http://localhost:3000/api/health
```

```bash
curl -X POST http://localhost:3000/api/contact \
	-H "Content-Type: application/json" \
	-d '{"name":"Tester","email":"test@example.com","message":"hello from local project"}'
```

## Vercel 배포

1. Git 저장소에 푸시
2. Vercel에서 `New Project` 선택
3. 저장소 연결 후 기본 설정으로 배포
4. 배포 후 `/api/health`와 폼 전송 동작 확인

## 참고

- Next.js 문서: https://nextjs.org/docs
- Vercel 배포: https://vercel.com/new

## API 응답 표준

모든 API는 아래 공통 응답 구조를 사용합니다.

성공 응답:

```json
{
	"ok": true,
	"code": "LOGIN_OK",
	"message": "login success",
	"traceId": "2f3a0d9f-...",
	"timestamp": "2026-03-12T12:34:56.000Z",
	"data": {
		"username": "kt"
	}
}
```

실패 응답:

```json
{
	"ok": false,
	"code": "INVALID_CREDENTIALS",
	"message": "아이디 또는 비밀번호가 올바르지 않습니다.",
	"traceId": "9a87b1d2-...",
	"timestamp": "2026-03-12T12:35:02.000Z",
	"details": null
}
```

- `traceId`는 장애 분석용 ID입니다.
- `5xx` 에러는 서버 로그에 `traceId`와 함께 기록됩니다.

## 대표 코드 목록

아래는 자주 사용하는 코드입니다.

- 인증/세션:
	- `LOGIN_OK`, `SIGNUP_OK`, `LOGOUT_OK`, `SESSION_OK`
	- `INVALID_CREDENTIALS`, `INVALID_USERNAME`, `INVALID_PASSWORD`, `USERNAME_EXISTS`, `UNAUTHORIZED`
- 사용자/프로필:
	- `INVALID_DISPLAY_NAME`, `INVALID_TIMEZONE`, `PROFILE_UPDATE_FAILED`
- 파일/업로드:
	- `UPLOAD_OK`, `FILE_REQUIRED`, `FILE_TOO_LARGE`, `UPLOAD_FAILED`
	- `FILE_NAME_REQUIRED`, `FILE_NAME_TOO_LONG`, `SIGNED_URL_FAILED`
- 자산/시세:
	- `ASSET_SAVE_FAILED`, `INVALID_LAWD_CODE`, `INVALID_DEAL_YMD`, `MARKET_DATA_NOT_FOUND`, `MARKET_LOOKUP_FAILED`
	- `LAWDCODE_NOT_FOUND`, `LAWDCODE_UPSTREAM_FAILED`, `LAWDCODE_LOOKUP_FAILED`
- 연동/웹훅/작업:
	- `INTEGRATION_CONNECT_FAILED`, `INVALID_PROVIDER`
	- `WEBHOOK_ACCEPTED`, `INVALID_SIGNATURE`, `INVALID_JSON`
	- `JOB_CREATED`, `INVALID_JOB_TYPE`, `INVALID_JOB_ID`, `JOB_NOT_FOUND`, `JOB_CREATE_FAILED`

## 부동산 시세 조회 설정

자산관리 > 부동산 항목에서 `시세 조회` 버튼을 사용하려면 아래 환경변수가 필요합니다.

```bash
REAL_ESTATE_API_KEY=국토교통부_실거래가_API_서비스키
REAL_ESTATE_LAWD_API_KEY=행정표준코드_서비스키(선택, 미설정시 REAL_ESTATE_API_KEY 사용)
```

- 데이터 소스: 국토교통부 실거래가 공개시스템 (`data.go.kr`)
- 입력값: 법정동코드(5자리), 조회년월(YYYYMM), 단지명(선택)
- 주소 입력은 다음(카카오) 우편번호 팝업으로 진행되며, 자가 항목은 주소 선택 직후 법정동코드를 자동 조회
- 수동 조회가 필요한 경우 `주소로 코드찾기` 버튼으로 재조회 가능
- 실거래가 API 키가 없으면 `시세 조회` 버튼은 비활성화되며, 현재시세를 직접 입력해서 계속 사용할 수 있음
- 시세 추정 로직: 최근 3개월 거래의 가중 평균(최근월 가중치 3, 이전월 2, 3개월 전 1)
- 최근 3개월에 거래가 없으면 최신 실거래 1건을 최종 시세로 반영
