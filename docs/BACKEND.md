# 베지왕 백엔드 구조

> 목표: 매일 아침 공영도매시장 경매가를 **우리 DB에 적재 → 집계 → 나침반 서빙**.  
> 프론트는 DB를 읽고, 외부 API 직접 호출은 수집(Cron) 파이프라인으로 분리한다.

## 가격 축 (읽고 시작할 것)

**내부 표준축은 원/kg 하나다.** 나눗셈은 소스 어댑터 안에서만 일어나고,
그 뒤로는 곱하기만 한다 — 상자가 = `perKg × weightKg`, 1개가 = `perKg × kgPerConsumerUnit`.

| 소스 | 역할 | 축 특성 |
|---|---|---|
| 가락 경매결과 | **경락가의 유일한 원천** | 행마다 `UUN`(거래단량)을 주므로 자기완결적 환산. 추정 불필요 |
| KAMIS 도매 | 교차검증 + 부트스트랩 기준선 | ⚠ 슬롯마다 축이 다르다 (아래) |
| KAMIS 소매 | 소매가 (오프라인 조사 표본) | 단위가 개수 기반이면 카탈로그 검증 중량 필요 |
| 네이버 쇼핑 | 소매가 (온라인 판매가) | 밴드+표본수+변동계수로 신뢰도 관리 (002) |

### ⚠ KAMIS dpr 슬롯의 축 규칙

`p_convert_kg_yn=Y`는 **중량 기반 단위의 dpr1~dpr4만** 원/kg로 변환한다.
dpr5(1개월전)·dpr6(1년전)·dpr7(평년)과 개수 기반 단위("1포기", "10개")는 변환되지 않는다.

2026-07-31 프로덕션 실측으로 확정 (배추, `unit="10kg(그물망 3포기)"`):

| 값 | 원문 | 원/kg |
|---|---:|---:|
| 가락 경락가 (UUN 기반) | 1,895 | 1,895 |
| KAMIS dpr2 (1일전) | 1,128 | 1,128 |
| KAMIS dpr7 (평년) | 13,146 | 1,315 (÷10kg) |

반드시 `resolveKamisPerKg(slot, value, unit, kgPerPiece)`를 거칠 것.
환산 근거가 없으면 `null`을 반환한다 — 1kg으로 가정하지 않는다.
회귀 테스트: `src/lib/sources/kamis.test.ts`.

### 진단

- `GET /api/debug/price-axis` — 품목별 두 소스의 원/kg를 나란히 덤프. 축이 어긋나면 여기서 먼저 보인다.
- `GET /api/health` — 스토리지·자격증명·최근 수집(`lastIngest`)·카탈로그 검증 현황
- `npm run catalog:verify` — KAMIS 실응답 단위와 대조 → `docs/CATALOG_VERIFICATION.md`

### 결측·기준선 정책

| 개념 | 규칙 |
|---|---|
| `priceStatus` | `live` / `carried`(최근 7일 이월, `asOfDate` 표시 필수) / `missing`(비노출) |
| `baselineMethod` | `kamis_dpr7`(부트스트랩) → 자체 이력 14일 이상이면 `moving_avg_30` → 365일 이상이면 `seasonal` |
| 서빙 대상 | `unitVerified: true` 품목만 (`servableCatalog()`). 현재 47/56 |
| 거품 배수 | 경락가·소매가 **양쪽이 모두 실측일 때만** 산출. 한쪽이라도 없으면 표시하지 않는다 |

설계 문서: [`superpowers/specs/2026-07-31-price-axis-and-baseline-design.md`](./superpowers/specs/2026-07-31-price-axis-and-baseline-design.md)

## 레이어

```
API Routes                Services                 Repositories            Storage
─────────────             ──────────               ────────────            ───────
/api/prices        →      price-feed               auction/catalog         Postgres | Memory
/api/waitlist      →      waitlist                 waitlist                Postgres | File
/api/cron/ingest   →      ingest → aggregate       auction/ingestRuns      Postgres | Memory
/api/health        →      env + repos meta
```

경로: `src/server/`

| 경로 | 역할 |
|---|---|
| `config/env.ts` | 환경변수 (시크릿 미노출) |
| `domain/` | 일자(KST), 도메인 모델, 자연키 |
| `repos/` | 인터페이스 + memory / postgres 구현 |
| `services/catalog.ts` | 시장·품목 마스터 시드 |
| `services/ingest.ts` | aT → garak 수집 + raw upsert |
| `services/aggregate.ts` | raw → daily_item_price → item_baseline |
| `services/price-feed.ts` | DB 우선 서빙, 없으면 실시간 어댑터 폴백 |
| `services/waitlist.ts` | 니즈 DB (Postgres → 파일 폴백) |

## 데이터 모델

SQL: `db/migrations/001_init.sql`, `002_retail_price.sql`, `003_price_axis.sql`
검증: `npx vitest run db/migrations.test.ts` (PGlite = 실제 Postgres WASM 빌드에 적용)

| 테이블 | 설명 |
|---|---|
| `markets` | 도매시장 마스터 (가락=`110001`) |
| `items` | 품목 마스터 + `unit_verified`(환산표 검증 상태) |
| `raw_auction` | 원천 경락 (자연키 멱등 upsert, payload 보존) + 파생 `price_per_kg` |
| `daily_item_price` | 품목×시장×일자 집계. **서빙은 `_per_kg` 컬럼만 읽는다** |
| `item_baseline` | 자체 평년선 + `method`(산출 근거) |
| `daily_retail_price` | 소매가 채널 (kamis / naver) |
| `waitlist` | 소비자 니즈 |
| `ingest_runs` | 수집 잡 로그 |

거래단위 컬럼(`avg_price` 등)은 **원문 보존 목적으로 남긴다** — 축 규칙이 바뀌어도
`raw_auction`에서 재집계할 수 있어야 한다. 서빙 경로는 `daily_item_price_served` 뷰
(축 확정 + `quality='ok'` + `unit_verified=true`)를 기준으로 한다.

## 수집 파이프라인

1. Cron `GET /api/cron/ingest` (매일 **08:00 KST** = UTC 23:00 → `vercel.json`)
2. Authorization: `Bearer $CRON_SECRET`
3. 소스 우선순위: **aT(serviceKey)** → **garak 계정** → empty
4. `raw_auction` upsert → `daily_item_price` / `item_baseline` 갱신
5. `/api/prices`는 DB에 당일 집계가 있으면 DB 서빙, 없으면 기존 라이브 오버레이

수동 백필: `/api/cron/ingest?date=YYYY-MM-DD`

## 환경변수

```bash
# Storage
DATABASE_URL=                 # 있으면 Postgres, 없으면 메모리+파일 폴백

# Cron
CRON_SECRET=                  # 프로덕션 필수

# Auction sources
DATA_GO_KR_SERVICE_KEY=
GARAK_API_ID=
GARAK_API_PW=
GARAK_AUCTION_DATAID=

# KAMIS (평년·소매 — 서빙 시 결합)
KAMIS_CERT_KEY=
KAMIS_CERT_ID=

# Optional
DEFAULT_MARKET_CODE=110001
BASELINE_WINDOW_DAYS=30
```

## Supabase 연결 (실가동)

1. [Supabase](https://supabase.com/dashboard)에서 프로젝트 생성(또는 기존 프로젝트 선택)
2. **Project Settings → Database → Connection string → URI** 복사  
   - 권장: **Session mode** (`…pooler.supabase.com:5432`)  
   - 비밀번호에 특수문자가 있으면 URL 인코딩
3. Cloud Agent Secrets 또는 `.env.local`에 추가:
   ```bash
   DATABASE_URL=postgresql://postgres.[ref]:[PASSWORD]@aws-0-….pooler.supabase.com:5432/postgres
   CRON_SECRET=   # 로컬에서 openssl rand -hex 32 로 생성 가능
   ```
4. 실행:
   ```bash
   npm run db:migrate
   npm run go:live    # migrate + 서버 + /api/cron/ingest 한 번에
   ```

> 이 환경의 Supabase/Vercel MCP는 `needsAuth` 상태라, Dashboard에서 URI를 직접 넣거나 Cursor에서 Supabase MCP를 인증해야 에이전트가 자동 연결할 수 있습니다.


## 로컬 (DB 없이)

`DATABASE_URL` 없으면 메모리 리포지로 수집·집계·서빙이 동작한다.  
대기자만 기존 `.data/waitlist.json` 파일 폴백을 유지한다.

```bash
npm test
npm run dev
curl -s localhost:3000/api/health | jq
curl -s -H "Authorization: Bearer dev" localhost:3000/api/cron/ingest
```

## 코드 지도

| 파일 | 역할 | 축 관련 주의 |
|---|---|---|
| `src/lib/sources/unit.ts` | 단위 문자열 파싱 (`parseUnitKg`, `unitTotalKg`) | **나눗셈의 근거를 만드는 유일한 곳** |
| `src/lib/sources/garak.ts` | `fetchGarakAuctionPerKg` → 원/kg | 거래단위로 되돌리지 않는다 |
| `src/lib/sources/kamis.ts` | `resolveKamisPerKg` 슬롯별 축 해석 | 위 축 규칙 참고 |
| `src/lib/catalog.ts` | `servableCatalog`, `lookupBySourceName` | 부분문자열 매칭 금지 — 정확일치 + 별칭만 |
| `src/lib/prices.ts` | `resolveAuctionPerKg`(축 게이트), 이월 로직 | 10배 이상 벌어지면 둘 다 거부 |
| `src/lib/compass.ts` | `withSignal` — 신호 계산 | **나눗셈 금지.** 곱해서만 파생한다 |
| `src/server/services/aggregate.ts` | raw → daily → baseline | 원/kg로 집계, 환산 불가 행은 제외 |

## 남은 작업

- [ ] `DATABASE_URL` / `CRON_SECRET` 설정 → `npm run db:migrate` → Cron 실가동
- [ ] 자체 이력 14일 축적 후 기준선이 `moving_avg_30`으로 자동 전환되는지 확인
- [ ] 축 정상화 후 거품 임계값(1.8 / 2.5) 실측 분포로 재조정
- [ ] 미검증 9품목: 수박(가락 UUN으로 실중량 확인), 수산 7종(도매 원천 부재 — 해수부 위판장 API 필요)
