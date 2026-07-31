<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

베지왕(Vegi-Wang): Next.js 16 (App Router) + React 19 + Tailwind v4 랜딩페이지. 공영도매시장 경매가를 "가격 나침반"으로 소비자에게 노출하고 관심 품목(니즈)을 수집한다.

- 실행/검증 명령은 `package.json` 스크립트 참고: `npm run dev` (Turbopack, http://localhost:3000), `npm run lint`, `npm run build`, `npm test`(vitest). Next 16은 dev/build 모두 Turbopack을 사용한다.
- 백엔드 구조는 `docs/BACKEND.md` + `src/server/` 참고. 시세 서빙은 `getServedPriceFeed`(DB `daily_item_price` 우선) → 없으면 `src/lib/prices.ts` 실시간 폴백. 수집은 `/api/cron/ingest`(Vercel Cron 08:00 KST)가 aT→garak 순으로 `raw_auction`에 멱등 upsert 후 집계.
- 대기자: `DATABASE_URL` 있으면 Postgres `waitlist`, 없으면 `.data/waitlist.json`(+인메모리 폴백).
- 기준일은 KST(`src/server/domain/date.ts`). 스토리지: `DATABASE_URL`→Postgres, 없으면 메모리 리포지.

## ⚠ 가격 축 불변식 — 깨뜨리면 서비스가 거짓말을 한다

설계: `docs/superpowers/specs/2026-07-31-price-axis-and-baseline-design.md`

1. **내부 표준축은 원/kg 하나다.** 나눗셈은 소스 어댑터 안에서만 일어난다.
   그 뒤로는 **곱하기만** 한다 — 상자가 = `perKg × weightKg`, 1개가 = `perKg × kgPerConsumerUnit`.
   `withSignal`에 나눗셈을 다시 넣으면 이중 나눗셈 버그가 되살아난다(무 36원/kg, 거품배수 64배).
2. **KAMIS dpr 슬롯은 축이 섞여 있다.** `p_convert_kg_yn=Y`는 **중량 기반 단위의 dpr1~dpr4만**
   원/kg로 바꾼다. dpr5·dpr6·dpr7과 개수 기반 단위("1포기","10개")는 변환되지 않는다.
   반드시 `resolveKamisPerKg(slot, value, unit, kgPerPiece)`를 거칠 것. 회귀 테스트는 `kamis.test.ts`.
3. **경락가 원천은 카테고리마다 다르다.** `sourceMarketFor(item)`이 정한다.
   - 청과 → **가락**: 행마다 UUN을 주므로 자기완결적 환산.
   - 수산 → **해수부 위판장**(15056856): `csmtAmount ÷ csmtWt`로 원/kg를 직접 얻는다.
     단위 문자열을 파싱하지 않으므로 가락보다도 안전하다. 원문 단가(`csmtUntpc`)는
     상자/마리 기준이 섞여 있어 **대표값으로 쓰면 안 된다** — 교차검증용이다.
   KAMIS 도매는 청과 교차검증·부트스트랩 전용. 주 원천으로 쓰면 안 된다.
   수산에는 KAMIS 도매 시계열·평년가를 **쓰지 않는다** — 도매시장가와 산지 위판가는
   유통 단계가 달라 섞으면 추세가 왜곡된다.
4. **추정 금지.** 환산 근거(단위 문자열 또는 검증된 카탈로그 중량)가 없으면 `null`을 반환한다.
   1kg으로 가정하거나 샘플값으로 채우지 않는다. 하드코딩 가격 더미는 전량 제거됐다.
5. **검증된 품목만 노출.** `servableCatalog()`(= `unitVerified: true`)만 서빙한다.
   판정: `npm run catalog:verify` → `docs/CATALOG_VERIFICATION.md` (현재 53/56 통과).
6. **결측은 이월 7일 + 날짜 라벨, 그 밖은 비노출.** `priceStatus`/`asOfDate`를 UI에서 반드시 표시.
7. **기준선은 근거를 밝힌다.** `baselineMethod`(`kamis_dpr7`/`moving_avg_30`/`seasonal`).
   자체 이력이 14일 미만이면 이동평균인 척하지 않는다(`MIN_BASELINE_SAMPLE_DAYS`).

진단:
- `/api/debug/price-axis` — 품목별 소스별 원/kg를 나란히 덤프. 축이 어긋나면 여기서 먼저 보인다.
- `/api/debug/fish-market` — 위판장 축 확정용. `DATA_GO_KR_SERVICE_KEY`가 붙는 순간
  ① `csmtWt`가 kg인지 ② `csmtUntpc`가 원/kg인지 ③ 품목명이 매칭되는지를 확인하고,
  셋 다 통과하면 `fishMarket.ts`의 "미검증" 주석을 지운다.
