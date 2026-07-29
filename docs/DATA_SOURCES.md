# 베지왕 데이터 소스 & 아침 경매가 DB 시스템 (단일 참조 문서)

> 목적: "매일 아침 경매가를 확실하게 확보하는 시스템"을 만들기 위해 **무엇을 신청하고, 무엇을 구축하는지**를 한 곳에 정리.

## 0. 결론 (한눈에)

최소한 **키 2종류**면 전부 커버됩니다.

| 우선순위 | 무엇 | 왜 | 상태 |
|---|---|---|---|
| ★ 필수 | **공공데이터포털 serviceKey** → aT `전국 공영도매시장 실시간 경매정보` | 전국 32개 도매시장(가락 포함, 청과+수산)의 **실제 경락가**를 serviceKey 하나로 | 신청 필요 |
| ★ 필수 | **KAMIS 인증키**(`p_cert_key`+`p_cert_id`) | 평년가(`dpr7`)·소매가(`dpr1`) → 나침반 기준·유통거품 비교 | ✅ 등록 완료 |
| ★ 대안(즉시가능) | garak.co.kr 경매결과 (`id/passwd/dataid`) | 발급 완료 — 가락시장 경락가를 지금 바로 사용 가능 | ✅ 사용 가능 |
| 선택 | 해수부 `위판장별 위탁판매 현황`, 부산 `국제수산물도매시장 경락정보` | 산지 위판(어시장) 가격까지 확장 시 | 나중 |

> 코드 우선순위: **aT serviceKey 있으면 aT → 없으면 garak 계정 → 없으면 샘플**. garak 인증정보가 발급됐다면 serviceKey 없이도 가락 경락가가 바로 동작.

---

## 1. 신청해야 할 Open API

### 1-1. (필수) aT 전국 공영도매시장 실시간 경매정보 — 경락가의 본체
- 데이터포털: `data.go.kr/data/15141808/openapi.do`
- 엔드포인트(예): `http://apis.data.go.kr/B552895/openapi/service/MallRltmInfoService/getMallRltmInfo`
- 인증: **공공데이터포털 serviceKey** (data.go.kr 회원가입 → "활용신청" → 자동/승인 후 키 발급)
- 주요 파라미터: `serviceKey`, `pageNo`, `numOfRows`, `saleDate`(일자, **명세서상 YYYY-MM-DD**), `whsalCd`(도매시장코드, 가락=`110001`), `type=json`
- 제공: 품목/거래량/가격(경락가)/정산일자 등, **전국 32개 시장**(서울가락·강서, 수원, 인천, 부산엄궁·반여·국제수산 등)
- 함께 신청: **표준코드 API** `data.go.kr/data/15141818` — `whsl_mrkt_cd`(시장), `corp_cd`(법인), `unit_cd`, `grd_cd`, `gds_lclsf/mclsf/sclsf_cd`(품목 대/중/소분류) 코드표. 품목 매칭에 필수.
- (선택) **경매원천정보** `data.go.kr/data/15141810` — 원천 상세가 필요할 때.

> 참고: 각 API 페이지에 **API 명세서 파일이 첨부**되어 있음. 실제 파라미터/응답 컬럼은 명세서로 최종 확인.

### 1-2. (필수·완료) KAMIS — 평년가 + 소매가
- `kamis.or.kr` 이용신청 완료 → `KAMIS_CERT_KEY`, `KAMIS_CERT_ID`
- 사용 API: **#2 일별 품목별 도·소매가격정보**(`dailyPriceByCategoryList`)
  - 도매(`p_product_cls_code=02`)의 `dpr7` → **평년가**(나침반 baseline 프록시)
  - 소매(`01`)의 `dpr1` → **소매가**(유통거품 비교, `p_convert_kg_yn=Y`로 원/kg)
- (선택) **#16/#17 신)일별 품목별 도매/소매 가격자료**: 기간 최대 1년 → baseline 이력 보강용

### 1-3. (선택) 수산 산지 위판
- 해수부 `위판장별 위탁판매 현황` `data.go.kr/data/15056856` (serviceKey) — 위판단가/수량
- 부산 `국제수산물도매시장 경락정보` `data.go.kr/data/15056673` (serviceKey)
- 단, 1-1의 aT API가 이미 수산 도매시장을 포함하므로 초기에는 불필요.

---

## 2. "아침 경매가 DB 시스템" 설계

핵심: **매일 경매가를 우리 DB에 원천 그대로 적재 → 집계 → 우리만의 평년 기준가 축적**. 자체 이력이 쌓이면 KAMIS 평년가 의존을 끊고 **경락가 자체의 평년선**을 갖는 것이 핵심 자산.

### 2-1. 수집 (Ingestion)
- 스케줄러가 매일 **경매·정산 종료 후(예: 08:00 KST)** aT API를 `saleDate=오늘`, 대상 `whsalCd`별로 **페이지네이션 전량 수집**.
- 옵션: Vercel Cron(`vercel.json` crons) → Route Handler, 또는 GitHub Actions 스케줄.
- 필수 처리: **재시도/백오프**, **휴장일(일요일·명절) 무데이터 허용**, 응답 스키마 검증, 트래픽 한도(개발계정 기본 10,000/일 → 운영계정 승인으로 상향).

### 2-2. 저장 (Storage) — Postgres (Neon/Vercel Postgres 또는 Supabase)
- `markets`, `items`(표준코드 매핑 마스터)
- `raw_auction` — 원천 경락 레코드(시장·법인·품목·단위·수량·경락가·saleDate·ingestedAt). **자연키 기준 멱등 upsert**(중복 방지, append-only).
- `daily_item_price` — 품목×시장×일자 집계(avg/min/max/volume). raw에서 파생.
- `item_baseline` — 품목별 최근 30일/평년 평균. **우리 경락가 이력으로 산출**.
- `waitlist` / `interest` — 소비자 니즈 DB(현재 파일 → 이관).

### 2-3. 가공 (Transform)
- 수집 직후 집계 job: `daily_item_price` 계산 → `item_baseline`(최근 N일 평균) 갱신 → 나침반 신호 원천.
- 표준코드 동기화 job(월 1회 정도).

### 2-4. 제공 (Serving)
- 웹은 `daily_item_price` + `item_baseline`을 읽어 나침반 렌더.
- **구현됨**: `src/server/services/price-feed.ts`가 DB 우선 서빙, 없으면 `src/lib/prices.ts` 실시간 폴백.
- 상세 구조: [`docs/BACKEND.md`](./BACKEND.md)

### 2-5. 신뢰성 체크리스트
- [x] 멱등 upsert(자연키: 시장+법인+품목+단위+등급+saleDate+seq+price) — `buildNaturalKey`
- [x] 수집 job 골격 + Cron (`/api/cron/ingest`, `vercel.json` 08:00 KST)
- [x] 타임존 KST 고정 (`src/server/domain/date.ts`)
- [ ] 수집 실패/무데이터 알림
- [ ] 트래픽 한도 모니터링 + 운영계정 신청
- [ ] 표준코드 최신화
- [x] 원천(raw) 보존 → 언제든 재집계 가능 (`raw_auction.payload`)

---

## 3. 지금 할 일 vs 키 발급 후 할 일

**지금(키 없이) 가능**
- ✅ 소스 어댑터(aT/garak/KAMIS) + 파서 단위테스트
- ✅ DB 스키마/마이그레이션 (`db/migrations/001_init.sql`)
- ✅ 수집·집계·서빙 백엔드 (`src/server/`) + 메모리 드라이런 테스트
- 샘플 폴백 유지

**serviceKey / DATABASE_URL 연결 후**
- `npm run db:migrate`로 스키마 적용
- aT 실호출로 응답 컬럼/시장·품목 코드 확정
- Cron 실가동 → `raw_auction` 적재 → 자체 평년가 축적

## 4. 환경변수 요약
```
# Storage / Cron
DATABASE_URL=
CRON_SECRET=

# 경락가 — 아래 둘 중 하나(코드가 aT 우선, 없으면 garak 사용)
DATA_GO_KR_SERVICE_KEY=        # (권장·전국) aT 전국 공영도매시장 실시간 경매정보 (+표준코드)
GARAK_API_ID=                  # (즉시가능·가락) garak 발급 id (예: 10579, 고정)
GARAK_API_PW=                  # garak 발급 passwd (고정) — 절대 코드/저장소에 넣지 말 것
GARAK_AUCTION_DATAID=          # 경매결과 dataid (예: data12)

# 평년가·소매가
KAMIS_CERT_KEY=                # KAMIS 인증키
KAMIS_CERT_ID=                 # KAMIS 요청자 ID
```

### garak 경매결과 호출 스펙(발급 확인)
- JSON: `http://www.garak.co.kr/homepage/publicdata/dataJsonOpen.do` (XML: `dataOpen.do`)
- 파라미터: `id`,`passwd`,`dataid`,`pagesize`,`pageidx`,`portal.templet=false`,`s_date`(YYYYMMDD),`s_bubin`(법인코드·필수),`s_pummok`(품목명·필수),`s_sangi`(선택)
- 법인코드: 서울청과 11000101 / 농협(공) 11000102 / 중앙청과 11000103 / 동부팜청과 11000104 / 한국청과 11000105 / 대아청과 11000106
- `s_bubin`이 필수 → 코드는 6개 법인을 순회해 품목별 경락가를 합산(평균)한다.
