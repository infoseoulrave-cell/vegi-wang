# 베지왕 개발일지

## Chapter 1 — 가격 축 정규화와 기준점 확립

*2026-07-31*

### 목표

Vercel·GitHub에 배포된 베지왕의 **올바른 DB**와, 제공받은 가격(가락 경락가 ·
KAMIS 도소매)에 대한 **가격기준점**을 제대로 세운다.

### 발견한 문제 (프로덕션 실측)

배포된 서비스가 아래 값을 내보내고 있었다.

| 품목 | 노출 경락가 | 소매가 | 거품배수 |
|---|---:|---:|---:|
| 무 | 36원/kg | 1,050 | 29.2배 |
| 양파 | 73원/kg | 1,876 | 25.7배 |
| 피망 | 169원/kg | 10,925 | **64.6배** |

원인은 셋이 겹친 것이었다.

1. **DB가 존재하지 않았다.** `/api/health`가 `databaseConfigured: false`,
   `storage: "memory"`. `db/migrations/001,002`는 작성만 되고 적용된 적이 없었다.
   `raw_auction` 적재량 0 → 자체 평년선(`item_baseline`)이 생성될 수 없는 구조.
2. **경락가가 weightKg만큼 두 번 나눠졌다.** KAMIS `p_convert_kg_yn=Y`가 dpr1~dpr4를
   원/kg로 내려주는데 거래단위 가격으로 취급했고, `reconcileAuctionPrice`가 두 값이
   3.5배 이상 벌어지면 낮은 쪽을 채택해 **정상값인 가락 상자가를 항상 버렸다.**
   그 원/kg 값이 `withSignal`에서 다시 weightKg로 나눠졌다.
3. **KAMIS 시계열에 두 축이 섞였다.** 같은 행에서 dpr2=1,128(원/kg)과
   dpr7=13,146(원/10kg)을 한 시계열로 합치고 있었다. 편차율이 -89%~+218%로 널뛴 이유.

부수적으로 하드코딩 가격 더미 20여 품목이 표시 없이 실시세인 척 노출됐고
(아보카도 20,000원/kg, 조기 66,667원/kg), 품목명 매칭이 양방향 부분문자열이라
"배"가 "배추"·"양배추"에 걸렸다.

### 확정한 축 규칙

배추 실측 교차검증으로 확정 (`unit="10kg(그물망 3포기)"`):

| 값 | 원문 | 원/kg |
|---|---:|---:|
| 가락 경락가 (UUN 기반) | 1,895 | 1,895 |
| KAMIS dpr2 (1일전) | 1,128 | 1,128 |
| KAMIS dpr7 (평년) | 13,146 | 1,315 (÷10kg) |

→ **`p_convert_kg_yn=Y`는 중량 기반 단위의 dpr1~dpr4만 변환한다.**
dpr5·dpr6·dpr7과 개수 기반 단위("1포기","10개")는 변환되지 않는다.
시금치 소매 "100g" dpr2, 배추 소매 "1포기" dpr2로 교차 확인.

### 완료 내용

- **단일 정규화 지점** — 내부 표준축을 원/kg 하나로. 나눗셈은 소스 어댑터 안에서만,
  이후로는 곱하기만 한다. 타입 이름에 축을 새겨 컴파일러가 강제하도록 함
  (`auctionPerKg`, `avgPricePerKg`, `baselinePerKg`).
- **축 해석기** `resolveKamisPerKg(slot, value, unit, kgPerPiece)` + 회귀 테스트.
  환산 근거가 없으면 `null` — 1kg으로 가정하지 않는다.
- **축 게이트** `resolveAuctionPerKg` — 두 소스가 10배 이상 벌어지면 낮은 쪽을
  고르는 대신 둘 다 거부하고 진단 로그를 남긴다.
- **카탈로그 검증** `scripts/verify-catalog.mjs` — KAMIS 실응답 단위와 대조.
  **47/56 통과**, 미통과 9종은 비노출. 근거는 `docs/CATALOG_VERIFICATION.md`.
- **하드코딩 더미 전량 제거** — `sample-data.ts` 삭제, 카탈로그는 메타 전용.
- **결측 정책** — 최근 7일 실측 이월 + 날짜 라벨, 그 밖은 비노출.
  소매가가 없으면 거품 배수·절약액을 표시하지 않는다(타입에서 optional).
- **기준선 근거 추적** — `baselineMethod`(`kamis_dpr7`/`moving_avg_30`/`seasonal`).
  자체 이력 14일 미만이면 이동평균인 척하지 않는다.
- **마이그레이션 003** — 원/kg 컬럼, `price_status`, `items.unit_verified`,
  `daily_item_price_served` 뷰. 원문 거래단위 컬럼은 재집계용으로 보존.
- **마이그레이션 검증 테스트** — PGlite(실제 Postgres WASM)에 001~003 전량 적용 +
  멱등 재실행 + CHECK 제약·뷰 동작 검증.
- **진단 엔드포인트** `/api/debug/price-axis`, `/api/health`에 `lastIngest`·카탈로그 요약.

### 검증

- 타입체크·린트·프로덕션 빌드 통과
- 테스트 **89개 통과** (14개 파일)
- 로컬 실행(키 없는 상태): `/api/prices` → **items 0개**
  (예전에는 56개 전부 더미로 채워졌다). 홈·카테고리·상세 모두 200.

### 다음 할 일

1. **DB 실가동 (사용자 조치 필요)** — Vercel Project Settings에 등록:
   ```
   DATABASE_URL=postgresql://postgres.[ref]:[PW]@…pooler.supabase.com:5432/postgres
   CRON_SECRET=<openssl rand -hex 32>
   ```
   이후 `npm run db:migrate` → Cron(08:00 KST) 실가동 → `raw_auction` 적재 확인.
   ※ 배포된 Vercel 프로젝트가 `seoul-rave` 팀에 없어 에이전트가 대신 설정할 수 없음.
2. 배포 후 `/api/debug/price-axis`로 거품배수 분포 확인 (정상이면 대략 1.2~6배)
3. 자체 이력 14일 축적 후 기준선이 `moving_avg_30`으로 전환되는지 확인
4. 축 정상화 후 거품 임계값(1.8 / 2.5) 실측 분포로 재조정
5. 미검증 9품목 처리 — 수박(가락 UUN으로 실중량 확인),
   수산 7종(도매 원천 부재 → 해수부 위판장 API 필요)

*마지막 업데이트: 2026-07-31*
