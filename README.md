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

시세는 `src/lib/prices.ts`가 두 소스를 **필드별로 조합**합니다(기준 카탈로그는 `src/lib/sample-data.ts`).

| 필드 | 소스 | 환경변수 |
|---|---|---|
| 경락가 오늘/전일 | 가락시장 경매결과 (`garak.co.kr/publicdata/dataOpen.do`) | `GARAK_API_ID`, `GARAK_API_PW`, `GARAK_AUCTION_DATAID` |
| 평년 기준가 | KAMIS 도매 `dpr7`(평년가) | `KAMIS_CERT_KEY`, `KAMIS_CERT_ID` |
| 소매가(원/kg) | KAMIS 소매 `dpr1` | `KAMIS_CERT_KEY`, `KAMIS_CERT_ID` |

- 소스 클라이언트: `src/lib/sources/garak.ts`(XML), `src/lib/sources/kamis.ts`(JSON). 파서는 `*.test.ts`로 단위테스트.
- 키가 없거나 실패하면 해당 값만 샘플로 폴백하여 항상 동작합니다.

> 가락 경매결과는 data.go.kr serviceKey가 아니라 **가락 계정(id/passwd) + 서비스ID(dataid)** 인증입니다. 라이브 응답 필드/품목명 매칭은 실제 키로 검증 후 확정 필요.

## 테스트

```bash
npm test   # vitest: 파서/나침반 지표 단위테스트
```

## 주요 경로

- `src/app/page.tsx` — 랜딩페이지
- `src/app/api/prices/route.ts` — 경매가 피드 API
- `src/app/api/waitlist/route.ts` — 니즈 DB(대기자) 등록 API
- `src/lib/compass.ts` — 가격 나침반 지표 로직
