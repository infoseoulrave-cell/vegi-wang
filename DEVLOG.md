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

---

## Chapter 2 — 수산 경락가 원천 연결 (해수부 위판장)

*2026-07-31*

### 목표

Chapter 1에서 수산 대부분이 카탈로그에서 빠졌다. 가락은 청과 6개 법인만
조회하므로 수산 경락가 원천이 애초에 없었고, 그 자리를 더미가 메우고 있었다.
해양수산부 위판장 API를 붙여 산지 위판가를 진짜 원천으로 삼는다.

### 조사 결과

명세를 추측하지 않고 공공데이터포털에서 확인했다.

| 항목 | 값 |
|---|---|
| API | 해양수산부_위판장별 위탁판매 현황 (15056856) |
| 엔드포인트 | `apis.data.go.kr/1192000/select0040List/getselect0040List` |
| 인증 | `DATA_GO_KR_SERVICE_KEY` (aT와 같은 키) |
| 핵심 필드 | `csmtAmount`(금액) · `csmtWt`(중량) · `csmtUntpc`(단가) · `goodsUnitNm`(단위) |

같은 계열의 `select0050List`(어종별 집계)도 봤지만 단위가 `상자(C/S)`로
내려오고 중량 필드가 없어 KAMIS와 같은 축 문제가 생긴다. 채택하지 않았다.

### 축 결정

**원/kg = csmtAmount ÷ csmtWt.**

단위 문자열을 전혀 파싱하지 않는 자기완결적 환산이다. 가락은 UUN을
파싱해야 하고 KAMIS는 슬롯마다 축이 달랐지만, 여기는 금액과 중량이 같은
행에 있어 나눗셈 한 번으로 축이 확정된다.

`csmtUntpc`는 상자/마리 기준이 섞여 있어 대표값으로 쓰지 않는다. 대신
`단가 ÷ (금액÷중량)` 비율을 남겨 축 진단에 쓴다 — 1에 가까우면 단가도 원/kg.

### 완료 내용

- `fishMarket.ts` 어댑터 + 단위 테스트 11개. 전국 위판장 총금액÷총중량
  중량 가중평균, 신선/냉장 우선(냉동과 섞지 않음)
- `sourceMarketFor()`로 원천 분리 — 청과는 가락, 수산은 위판장.
  `PriceItem.sourceMarket`으로 카드마다 출처 표시
- **수산에는 KAMIS 도매 시계열·평년가를 쓰지 않는다.** 도매시장가와 산지
  위판가는 유통 단계가 달라 섞으면 산지가 항상 '고가권'으로 보인다
- 마이그레이션 004: `raw_auction.source`에 `fish_market` 허용,
  시장 `900001` "전국 수협 위판장", `items.source_market`
- 수집·서빙 모두 두 시장을 읽는다. 위판 수집 실패가 청과를 막지 않는다
- `/api/debug/fish-market` — 키가 붙는 순간 축을 확정하는 진단 경로

### 카탈로그 47 → 53 / 56

수산의 원/kg가 금액÷중량으로 나오므로 거래단위 환산 자체가 불필요하다.
수산에 KAMIS 도매 단위 대조를 요구하던 규칙을 제거했다.

출처 없는 '1마리 중량'은 지어내지 않았다. 꽁치·조기·수입조기는 거래단위를
위판 원천 축(중량)에 맞춰 1kg으로 통일하고 마리 단위 주장을 제거했다.

남은 3종: 수박(도매 단위가 개수 기반), 아보카도(도매 시세 없음),
수입조기(수입산 — 국내 산지 위판 원천 없음).

### 검증

- 테스트 **103개 통과** (15개 파일)
- 마이그레이션 001~004 PGlite 실제 Postgres 적용 + 멱등 확인
- 타입체크·린트·프로덕션 빌드 통과
- 키 없는 로컬 실행: `/api/debug/fish-market` → `missing_credentials` 명시,
  피드는 여전히 items 0개(더미 없음), 홈·수산 카테고리·상세 모두 200

### ⚠ 아직 확인 못 한 것

`DATA_GO_KR_SERVICE_KEY` 미발급이라 라이브 응답을 보지 못했다.
`/api/debug/fish-market`이 키가 붙는 즉시 셋을 확정한다.

1. `csmtWt`가 kg인가 — 톤이면 원/kg가 1000배 어긋난다
2. `csmtUntpc`가 원/kg인가 — `unitPriceRatioMedian ≈ 1`
3. `mprcStdCodeNm`이 카탈로그 품목명과 매칭되는가

①이 틀려도 `FISH_PLAUSIBLE_PER_KG` 밴드가 거부하므로 화면에는 안 나간다.
③은 매칭 실패 시 품목이 숨겨질 뿐 틀린 값이 나가지 않는다. 둘 다 fail-safe다.

### 다음 할 일

1. **공공데이터포털 `DATA_GO_KR_SERVICE_KEY` 활용신청** (민호)
   — 이 키 하나로 aT 전국 도매시장 + 해수부 위판장을 함께 커버한다
2. 키 등록 후 `/api/debug/fish-market`으로 축 3종 확정 → `fishMarket.ts`
   "미검증" 주석 제거
3. 실제 `mprcStdCodeNm` 목록으로 `FISH_ALIASES` 정정
4. Chapter 1의 `DATABASE_URL` / `CRON_SECRET` 등록은 여전히 대기 중

*마지막 업데이트: 2026-07-31*
