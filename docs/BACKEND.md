# 베지왕 백엔드 구조

> 목표: 매일 아침 공영도매시장 경매가를 **우리 DB에 적재 → 집계 → 나침반 서빙**.  
> 프론트는 DB를 읽고, 외부 API 직접 호출은 수집(Cron) 파이프라인으로 분리한다.

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

SQL: `db/migrations/001_init.sql`

| 테이블 | 설명 |
|---|---|
| `markets` | 도매시장 마스터 (가락=`110001`) |
| `items` | 내부 품목 카탈로그 + 표준코드 슬롯 |
| `raw_auction` | 원천 경락 (자연키 멱등 upsert, payload 보존) |
| `daily_item_price` | 품목×시장×일자 집계 |
| `item_baseline` | 최근 N일 자체 평년선 |
| `waitlist` | 소비자 니즈 |
| `ingest_runs` | 수집 잡 로그 |

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

## 마이그레이션

Neon / Vercel Postgres / Supabase SQL editor에서:

```bash
psql "$DATABASE_URL" -f db/migrations/001_init.sql
```

## 로컬 (DB 없이)

`DATABASE_URL` 없으면 메모리 리포지로 수집·집계·서빙이 동작한다.  
대기자만 기존 `.data/waitlist.json` 파일 폴백을 유지한다.

```bash
npm test
npm run dev
curl -s localhost:3000/api/health | jq
curl -s -H "Authorization: Bearer dev" localhost:3000/api/cron/ingest
```

## 기존 코드와의 관계

- `src/lib/sources/*` — 외부 API 파서 (순수함수 + 단위테스트) 유지
- `src/lib/prices.ts` — 실시간 폴백 어댑터로 유지
- `src/lib/compass.ts` — 나침반 지표 (변경 없음)
- API `/api/prices`, `/api/waitlist`는 서버 서비스를 경유
