# 베지왕 (Vegi-Wang)

> 한국 농수산물 유통구조를 소비자 편으로. 매일 아침 공영도매시장 **경매가**를 소비자의 언어로 번역하는 "가격 나침반" 플랫폼.

## 무엇을 하나

- **오늘의 경락가·소매가 보드** — 가락시장 경락가(도매)와 KAMIS 소매가를 나란히 노출
- **살 타이밍 나침반** — 경락가를 평년(최근 30일 평균)과 비교해 `사기 좋은 날 / 적정 / 관망` 신호로 변환
- **유통 거품 지표** — 소매가 ÷ 경락가(원/kg) 배수로 `소매가 합리적 / 유통마진 보통 / 소매 거품 큼`을 판정하고, 도매로 살 때 kg당 절약액을 계산
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

시세는 `src/lib/prices.ts`에서 두 소스를 조합합니다(기준 카탈로그·평년가는 `src/lib/sample-data.ts`).

- `DATA_GO_KR_SERVICE_KEY` — 공공데이터포털 서울시농수산식품공사 **가락시장 경매결과**(오늘 경락가) 오버레이
- `KAMIS_CERT_KEY`, `KAMIS_CERT_ID` — KAMIS **전국 소매가**(원/kg) 오버레이
- 키가 없거나 실패하면 해당 값은 샘플로 폴백하여 항상 동작합니다.

> 라이브 연동 시 응답 필드 매핑과 기준가(평년/최근평균) 산출식은 실제 인증키로 검증 후 확정 필요.

## 주요 경로

- `src/app/page.tsx` — 랜딩페이지
- `src/app/api/prices/route.ts` — 경매가 피드 API
- `src/app/api/waitlist/route.ts` — 니즈 DB(대기자) 등록 API
- `src/lib/compass.ts` — 가격 나침반 지표 로직
