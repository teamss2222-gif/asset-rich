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
