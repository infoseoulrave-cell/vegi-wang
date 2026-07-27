# 베지왕 (Vegi-Wang)

> 한국 농수산물 유통구조를 소비자 편으로. 매일 아침 공영도매시장 **경매가**를 소비자의 언어로 번역하는 "가격 나침반" 플랫폼.

## 무엇을 하나

- **오늘의 경매가 보드** — 가락시장 등 공영도매시장의 아침 경매가를 품목별로 노출
- **가격 나침반** — 경매가를 평년(최근 30일 평균)과 비교해 `사기 좋은 날 / 적정 / 관망` 신호로 변환
- **니즈 DB 시드** — 관심 품목 + 알림 신청을 소비자 수요 데이터로 축적 (향후 사입·판매 연결의 기반)

## 기술 스택

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint
npm run build
```

## 데이터 소스

경매가는 `src/lib/prices.ts`에서 가져옵니다.

- 환경변수 `KAMIS_CERT_KEY`, `KAMIS_CERT_ID` 가 설정되면 KAMIS(농수산물유통정보) OpenAPI를 시도합니다.
- 키가 없거나 실패하면 `src/lib/sample-data.ts` 의 샘플 데이터로 자동 폴백하여 항상 동작합니다.
- 대안 소스: 공공데이터포털(data.go.kr) 서울시농수산식품공사 "경매결과 / 주요 품목 가격" API.

> 라이브 연동 시 응답 필드 매핑과 기준가(평년/최근평균) 산출식은 실제 인증키로 검증 후 확정 필요.

## 주요 경로

- `src/app/page.tsx` — 랜딩페이지
- `src/app/api/prices/route.ts` — 경매가 피드 API
- `src/app/api/waitlist/route.ts` — 니즈 DB(대기자) 등록 API
- `src/lib/compass.ts` — 가격 나침반 지표 로직
