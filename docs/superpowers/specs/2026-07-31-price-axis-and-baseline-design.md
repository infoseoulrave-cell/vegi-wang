# 베지왕 가격 축 정규화 & 기준점 설계

*작성일: 2026-07-31*

> 목적: "제공받은 가격"(가락 경락가 · KAMIS 도소매 · 네이버 소매)을 **하나의 검증된 축**에 올리고,
> 그 위에 **자체 평년선**을 쌓을 수 있는 DB를 실가동한다.

---

## 1. 문제 (프로덕션 실측, 2026-07-31)

### 1-1. DB가 존재하지 않는다

`GET https://vegi-wang.vercel.app/api/health`

```json
{ "storage": "memory", "databaseConfigured": false, "credentials": { "cron": false } }
```

- `db/migrations/001,002`는 작성만 되고 **적용된 적이 없다**.
- `raw_auction` 적재량 0 → `item_baseline`(자체 평년선)이 **영원히 생성되지 않는다**.
- 서버리스 메모리 리포지는 콜드스타트마다 소멸한다. `waitlistTotal: 0`.
- `CRON_SECRET` 미설정 → `vercel.json`의 08:00 KST Cron이 인증에 실패하거나 무의미하다.

### 1-2. 경락가가 weightKg만큼 두 번 나눠진다

`GET /api/prices` 실측:

| 품목 | 노출된 경락가(원/kg) | 소매가(원/kg) | 거품배수 | 전일대비 |
|---|---:|---:|---:|---:|
| 무 | 36 | 1,050 | 29.2배 | 0% |
| 양파 | 73 | 1,876 | 25.7배 | 0% |
| 당근 | 87 | 3,442 | 39.6배 | 0% |
| 배추 | 113 | 1,435 | 12.7배 | 0% |
| 피망 | 169 | 10,925 | **64.6배** | 0% |

원인 경로:

1. `kamis.ts:buildParams`가 `p_convert_kg_yn=Y`를 보낸다 → KAMIS 도매 `dpr1~dpr4`가 **원/kg**로 내려온다.
2. `extractKamisSeries`가 이 값을 `series`에 담고, `KamisPrice.series`는 주석상 "거래단위 기준"으로 **잘못 문서화**되어 있다.
3. `prices.ts:reconcileAuctionPrice(garakToday, kamisToday, …)`가
   `garakToday`(원/거래단위) ÷ `kamisToday`(원/kg) = 대략 `weightKg` 배 → `> 3.5` 조건에 걸려
   **정상값인 가락 상자가를 버리고 KAMIS 원/kg 값을 채택**한다.
4. `compass.ts:withSignal`이 `auctionPerKg = auctionPrice / weightKg`를 수행 → **두 번째 나눗셈**.

검산: 당근 3,442 ÷ 39.56 = 87, 87 × 20kg = 1,740원/kg (정상 범위).

`changeRate`가 0인 품목은 전부 이 경로를 탄 것이고(가락 조회 실패 → KAMIS 폴백),
`changeRate ≠ 0`인 품목(깻잎·상추·시금치 등)은 가락 경로라 축이 살아 있다.
**즉 같은 화면 안에서 품목마다 축이 다르다.**

### 1-3. KAMIS 시계열은 두 축이 섞여 있다

`/api/debug/sources` 원시 응답 (배추 도매, `unit = "10kg(그물망 3포기)"`):

| 슬롯 | 값 | 실제 축 | 원/kg 환산 |
|---|---:|---|---:|
| dpr2 (1일전) | 1,128 | 원/kg | 1,128 |
| dpr3 (1주전) | 899 | 원/kg | 899 |
| dpr5 (1개월전) | 7,372 | 원/거래단위 | 737 |
| dpr6 (1년전) | 14,584 | 원/거래단위 | 1,458 |
| dpr7 (평년) | 13,146 | 원/거래단위 | 1,315 |

교차검증 — 같은 날 가락 경락가 = **1,895원/kg**. dpr2(1,128)·dpr7÷10(1,315)과 같은 자릿수로 정합한다.
dpr7을 원/kg로 읽으면 배추 평년가가 13,146원/kg이 되어 물리적으로 불가능하다.

**확정 규칙: `p_convert_kg_yn=Y`는 중량 기반 단위의 dpr1~dpr4만 원/kg로 변환한다.
dpr5·dpr6·dpr7은 거래단위 그대로다. 개수 기반 단위("1포기", "10개")는 아무것도 변환하지 않는다.**

현재 `extractKamisSeries`는 dpr1~dpr6을 무조건 한 시계열로 합친다 →
`analyzeTrend`의 분위·평균·`deviationRate`가 두 축의 혼합값 위에서 계산된다.
실측 편차율이 -89% ~ +218%로 널뛰는 이유다.

### 1-4. 하드코딩 더미가 실데이터로 노출된다

`sample-data.ts`에 20여 품목이 동일한 `auctionPrice: 20000 / auctionPrevPrice: 19000 /
auctionBaseline: 21000 / retailPricePerKg: 5000`으로 박혀 있고, 라이브 실패 시 **아무 표시 없이** 그대로 나간다.

실측 노출값: 아보카도·꼬막·꽃게·낙지·바지락 = `20,000원/kg`, 전일대비 `+5.3%`, 이력 1개.
꽁치·조기·수입조기 = `66,667원/kg` (20,000 ÷ 0.3).

### 1-5. 환산표 자체가 검증되지 않았다

- 꽁치: `auctionUnit: "5마리"`, `weightKg: 0.3`, `kgPerConsumerUnit: 0.4` → **1마리가 5마리보다 무겁다**
- 낙지: `auctionUnit: "100g"`, `weightKg: 1` → 단위 문자열과 환산중량이 10배 어긋난다
- 더미 20여 품목은 `weightKg`도 근거 없이 찍힌 값

### 1-6. 품목명 매칭이 양방향 부분문자열이다

`prices.ts:pickByName`:

```ts
if (k === base || k.includes(base) || base.includes(k)) return v;
```

"배"가 "배추"·"양배추"·"알배기배추"에 걸린다. Map 순회 순서에 따라 결과가 달라진다.
실측에서 파프리카 소매가가 1,057원/kg(실제 ~7,000원/kg)으로 나오는 것은 오매칭으로 추정된다.

---

## 2. 설계 원칙

### 원칙 1 — 단일 정규화 지점 (Single Normalization Point)

**내부 표준축은 원/kg 하나다.** 소스 어댑터가 원/kg로 정규화하고, **그 이후 어디서도 다시 나누지 않는다.**
거래단위 가격·소비자단위 가격은 표시 직전에 **곱해서** 파생한다.

```
소스 어댑터 ──(원/kg + 환산근거)──▶ DB(원/kg) ──▶ 서빙(원/kg) ──▶ UI
                                                              └─ × weightKg          = 상자가
                                                              └─ × kgPerConsumerUnit = 1개가
```

나눗셈이 어댑터 안에만 존재하므로 이중 나눗셈이 **구조적으로 불가능**해진다.
타입 이름에 축을 새겨 컴파일 타임에 강제한다: `pricePerKg`, `pricePerUnit`은 서로 다른 필드다.

### 원칙 2 — 소스마다 역할을 하나만 준다

| 소스 | 역할 | 근거 |
|---|---|---|
| 가락 경매결과 | **경락가(도매)의 유일한 원천** | 행마다 `UUN`(거래단량)을 주므로 행 단위로 자기완결적 환산이 가능하다. 추정이 필요 없다. |
| KAMIS 도매 | **교차검증 + 초기 부트스트랩 전용** | 축이 슬롯마다 다르다. 주 원천으로 쓰면 안 된다. |
| KAMIS 소매 | 소매가 채널 (오프라인 조사 표본) | 002 마이그레이션 설계 유지 |
| 네이버 쇼핑 | 소매가 채널 (온라인 판매가) | 002 마이그레이션 설계 유지 |

1-2의 버그 전체가 "KAMIS 도매를 경락가의 대체재로 썼기 때문"에 발생했다.
`DATA_SOURCES.md`가 이미 목표로 명시한 방향이기도 하다 —
*"자체 이력이 쌓이면 KAMIS 평년가 의존을 끊고 경락가 자체의 평년선을 갖는 것이 핵심 자산"*.

### 원칙 3 — 검증되지 않은 값은 노출하지 않는다

추정·폴백·더미는 **표시하지 않거나, 표시한다면 반드시 라벨을 단다.** 무표시 추정값은 금지한다.

---

## 3. 세 층의 가격기준점

### 3-1. 단위 기준점 — 원/kg 정규화

모든 가격은 `pricePerKg`로 저장한다. 환산에는 **행이 스스로 제공한 단위**만 쓴다.

- 가락: 행의 `UUN` → `parseUnitKg(UUN)` → `price / unitKg`. `UUN`이 중량으로 파싱되지 않는 행(마리/속/단)은 **집계에서 제외**한다.
- KAMIS 도매: 슬롯별 축 규칙(1-3)을 명시적으로 적용하는 `resolveKamisWholesalePerKg()`를 둔다.
- KAMIS 소매: 단위가 중량 기반이면 파싱, 개수 기반이면 **카탈로그의 검증된 `kgPerConsumerUnit`만** 사용. 검증값이 없으면 `null` 반환(추정 금지).

`kamis.ts`의 `CONSUMER_KG_HINT` 상수는 카탈로그와 이중 관리되고 있으므로 **삭제**하고 카탈로그를 단일 출처로 삼는다.

#### 축 정합성 게이트

정규화 직후 각 값에 대해 검사한다:

- 같은 품목·같은 날의 서로 다른 소스 값이 **10배 이상** 벌어지면 낮은 쪽을 채택하지 않고 **둘 다 거부**하고 `ingest_runs`에 경고를 남긴다.
- 품목별 `plausible_min_per_kg` / `plausible_max_per_kg`(카탈로그 컬럼) 밖의 값은 저장하되 `quality='rejected'`로 표시하고 서빙에서 제외한다.

1-2 같은 버그가 재발하면 **화면이 아니라 로그에서 먼저 터지게** 만드는 장치다.

### 3-2. 시간 기준점 — 자체 평년선

`item_baseline`을 **우리 경락가 이력**으로 계산한다.

| 단계 | 조건 | 기준선 | 표시 |
|---|---|---|---|
| 부트스트랩 | 자체 이력 < 14일 | KAMIS `dpr7` ÷ unitKg (원/kg 환산) | "KAMIS 평년 기준" |
| 이동평균 | 자체 이력 ≥ 14일 | 최근 30일 이동평균 (`BASELINE_WINDOW_DAYS`) | "최근 30일 기준" |
| 계절 | 자체 이력 ≥ 365일 | 동일 시기(±7일) 전년 평균 혼합 | "평년 기준" |

`item_baseline`에 `method`('kamis_dpr7' | 'moving_avg_30' | 'seasonal') + `sample_days` 컬럼을 추가해
**어떤 근거로 나온 기준선인지 항상 추적 가능**하게 한다. UI도 이 라벨을 그대로 노출한다.

표본이 부족한데 이동평균을 흉내내지 않는다 — 부트스트랩 단계임을 명시한다.

### 3-3. 채널 기준점 — 유통 거품 배수

`retailMultiple = retailPricePerKg / auctionPricePerKg`.
**양쪽 모두 `quality='ok'`이고 같은 기준일일 때만** 산출한다. 하나라도 결측이면 배수를 표시하지 않는다.

임계값(1.8 / 2.5)은 축이 정상화된 뒤 실측 분포를 보고 재조정한다. 이번 범위에서는 유지하되,
정상화 후 배수 분포를 `docs/`에 리포트로 남긴다.

---

## 4. 결측 정책

`price_status`를 명시적 상태로 둔다.

| 상태 | 조건 | UI |
|---|---|---|
| `live` | 당일 실측 | 그대로 표시 |
| `carried` | 최근 **7일 이내** 실측값 이월 | "7/29 경락가 기준" 라벨 필수 |
| `missing` | 7일 초과 또는 실측 없음 | **카드 비노출** |

- 가락시장은 일요일·공휴일 휴장이므로 결측은 구조적으로 발생한다. 무조건 비노출은 주말마다 사이트를 비운다.
- `sample-data.ts`의 하드코딩 가격 더미는 **전량 삭제**한다. 카탈로그는 품목 메타(이름·단위·환산중량·카테고리)만 남긴다.

---

## 5. 카탈로그 정합성

`items` 테이블 및 카탈로그 소스에 검증 상태를 명시한다.

```sql
ALTER TABLE items
  ADD COLUMN unit_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN unit_source          TEXT,      -- 'garak_uun' | 'kamis_unit' | 'manual'
  ADD COLUMN verification_note    TEXT,
  ADD COLUMN plausible_min_per_kg NUMERIC(14,2),
  ADD COLUMN plausible_max_per_kg NUMERIC(14,2);
```

서빙 조건: `is_active = unit_verified AND (최근 7일 내 quality='ok' 가격 존재)`.

검증 절차 (`scripts/verify-catalog.mjs`):

1. 가락 실응답의 `UUN` 최빈값과 카탈로그 `weightKg` 대조
2. KAMIS 소매 `unit` 문자열과 `consumerUnit` / `kgPerConsumerUnit` 대조
3. 내부 모순 검사 — `kgPerConsumerUnit > weightKg`(꽁치 사례), `parseUnitKg(auctionUnit) ≠ weightKg`(낙지 사례)
4. 리포트를 `docs/CATALOG_VERIFICATION.md`로 출력. 통과 품목만 `unit_verified = true`.

품목 수는 줄지만, **보이는 값은 전부 방어 가능**해진다.

---

## 6. 품목명 매칭

양방향 부분문자열 매칭을 폐기하고 3단계로 바꾼다.

1. 정확 일치 (`item.name`)
2. 명시적 별칭 테이블 (`item_aliases`: `kamis_name`, `garak_pummok`) — 카탈로그에 선언
3. 실패 시 `null` (추측 금지) + `ingest_runs`에 미매칭 품목명 기록

미매칭 로그는 카탈로그 확장의 입력이 된다.

---

## 7. DB 실가동

### 7-1. 프로비저닝

Supabase Postgres (`docs/BACKEND.md`에 이미 문서화된 경로).

필요한 환경변수 — **사용자 조치 필요**:

```
DATABASE_URL=postgresql://postgres.[ref]:[PW]@…pooler.supabase.com:5432/postgres
CRON_SECRET=<openssl rand -hex 32>
```

Vercel Project Settings → Environment Variables에 Production/Preview 양쪽 등록.

### 7-2. 마이그레이션

| 파일 | 내용 |
|---|---|
| `001_init.sql` | 기존 (적용 필요) |
| `002_retail_price.sql` | 기존 미커밋 (적용 필요) |
| `003_price_axis.sql` | **신규** — 원/kg 축 정규화, `price_status`, `quality`, `items` 검증 컬럼, `item_baseline.method` |

`scripts/db-migrate.mjs`는 이미 디렉터리 전량 순차 적용으로 개선되어 있다(미커밋). 그대로 채택한다.

### 7-3. `003_price_axis.sql` 요지

```sql
-- 경락 집계: 원/kg 축 명시
ALTER TABLE daily_item_price
  ADD COLUMN avg_price_per_kg NUMERIC(14,2),
  ADD COLUMN unit_kg          NUMERIC(10,3),
  ADD COLUMN price_status     TEXT NOT NULL DEFAULT 'live'
    CHECK (price_status IN ('live','carried','missing')),
  ADD COLUMN as_of_date       DATE,
  ADD COLUMN quality          TEXT NOT NULL DEFAULT 'ok'
    CHECK (quality IN ('ok','rejected'));

-- 원천에도 파생 원/kg 보존 (재집계 없이 축 검증 가능)
ALTER TABLE raw_auction
  ADD COLUMN unit_kg      NUMERIC(10,3),
  ADD COLUMN price_per_kg NUMERIC(14,2);

-- 기준선 산출 근거 추적
ALTER TABLE item_baseline
  ADD COLUMN method TEXT NOT NULL DEFAULT 'moving_avg_30'
    CHECK (method IN ('kamis_dpr7','moving_avg_30','seasonal')),
  ADD COLUMN avg_price_per_kg NUMERIC(14,2);
```

기존 `avg_price` 등 거래단위 컬럼은 **삭제하지 않고 남긴다** — 원천 보존 원칙. 서빙은 `_per_kg` 컬럼만 읽는다.

### 7-4. Cron

`vercel.json`의 `0 23 * * *`(08:00 KST) 유지. `CRON_SECRET` 설정 후 실가동.
`ingest_runs`에 실패/무데이터/축거부 건수를 남기고, `/api/health`가 **최근 수집 성공 시각**을 노출한다.

---

## 8. 구현 순서

DB 자격증명 없이도 1~2단계는 전부 진행 가능하다. 3단계만 사용자 조치를 기다린다.

**1단계 — 축 고정 (DB 불필요)**
1. `KamisPrice` / `PriceItem` 필드를 원/kg 축으로 재정의, 타입명에 축 명시
2. `resolveKamisWholesalePerKg()` 신설 — dpr 슬롯별 축 규칙 + 단위 테스트
3. `kamis.ts` 소매 정규화에서 `CONSUMER_KG_HINT` 제거, 카탈로그 단일 출처화
4. `fetchGarakAuction`이 원/kg를 반환하도록 변경 (`* catalogWeightKg` 제거)
5. `reconcileAuctionPrice` 폐기 → `resolveAuctionPerKg()` (가락 우선, KAMIS 교차검증)
6. `withSignal`에서 `/ weightKg` 제거, 표시용 파생값으로 대체
7. `pickByName` → 정확일치 + 별칭 테이블
8. `sample-data.ts` 가격 더미 전량 삭제, 카탈로그 메타만 유지
9. `price_status` 이월 로직 + UI 라벨

**2단계 — 카탈로그 검증**
10. `scripts/verify-catalog.mjs` + `docs/CATALOG_VERIFICATION.md`
11. 검증 실패 품목 `unit_verified = false` → 비노출
12. `/api/debug/price-axis` — 품목별 원시 dpr·UUN·환산결과를 덤프하는 상시 회귀 진단

**3단계 — DB 실가동 (사용자 조치 후)**
13. Supabase 프로비저닝, `DATABASE_URL` / `CRON_SECRET` 등록
14. `003_price_axis.sql` 작성 + `npm run db:migrate`
15. `aggregate.ts`를 원/kg 기준 + `method` 추적으로 재작성
16. Cron 실가동 → `raw_auction` 적재 확인 → 14일 후 이동평균 전환

**4단계 — 검증**
17. 단위 테스트 (축 변환, 슬롯 규칙, 이월 로직, 매칭)
18. 배포 후 `/api/prices` 실측 재확인 — 배수 분포가 1.2~6배 범위에 들어오는지
19. `docs/` 리포트 갱신, DEVLOG 기록

---

## 9. 성공 기준

- [ ] `/api/health` → `databaseConfigured: true`, `storage: "postgres"`
- [ ] `raw_auction`에 일별 행이 누적되고 `ingest_runs`에 성공 기록이 남는다
- [ ] `/api/prices`의 모든 품목이 **같은 축**(원/kg)이다 — 무·양파·당근이 세 자릿수로 나오지 않는다
- [ ] `retailMultiple`이 상식 범위(대략 1.2~6배)에 들어온다. 밖이면 그 품목이 실제로 그런지 근거를 댈 수 있다
- [ ] 하드코딩 가격 더미가 코드베이스에 존재하지 않는다 (`grep 20000` 무결과)
- [ ] 노출되는 모든 가격에 `live` / `carried(날짜)` 상태가 붙는다
- [ ] `item_baseline.method`로 기준선 근거를 항상 설명할 수 있다
- [ ] 카탈로그 내부 모순(꽁치·낙지 유형)이 0건

---

## 10. 열린 질문

- **aT 전국 API**: `DATA_GO_KR_SERVICE_KEY` 미발급 상태. 발급되면 32개 시장으로 확장 가능하나 이번 범위 밖.
- **거품 임계값 재조정**: 축 정상화 후 실측 분포를 봐야 1.8 / 2.5가 타당한지 판단할 수 있다. 리포트 후 별도 결정.
- **수산 품목**: 가락 청과 법인 6개만 조회하므로 수산은 경락가 원천이 없다. 현재 KAMIS 도매로 때우고 있으나 축이 불안정하다. 검증 통과 품목만 남기면 대부분 비노출될 가능성이 높다. 수산은 별도 원천(해수부 위판장 API) 확보 전까지 축소를 감수한다.
