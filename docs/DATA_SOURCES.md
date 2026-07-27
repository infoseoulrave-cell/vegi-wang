# 베지왕 데이터 소스 & 아침 경매가 DB 시스템 (단일 참조 문서)

> 목적: "매일 아침 경매가를 확실하게 확보하는 시스템"을 만들기 위해 **무엇을 신청하고, 무엇을 구축하는지**를 한 곳에 정리.

## 0. 결론 (한눈에)

최소한 **키 2종류**면 전부 커버됩니다.

| 우선순위 | 무엇 | 왜 | 상태 |
|---|---|---|---|
| ★ 필수 | **공공데이터포털 serviceKey** → aT `전국 공영도매시장 실시간 경매정보` | 전국 32개 도매시장(가락 포함, 청과+수산)의 **실제 경락가**를 serviceKey 하나로 | 신청 필요 |
| ★ 필수 | **KAMIS 인증키**(`p_cert_key`+`p_cert_id`) | 평년가(`dpr7`)·소매가(`dpr1`) → 나침반 기준·유통거품 비교 | ✅ 등록 완료 |
| 선택 | 해수부 `위판장별 위탁판매 현황`, 부산 `국제수산물도매시장 경락정보` | 산지 위판(어시장) 가격까지 확장 시 | 나중 |
| 폐기 | garak.co.kr `id/passwd/dataid` (경매결과) | aT 통합 API로 대체 (2025-02 data.go.kr 이관) | 사용 안 함 |

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
- `src/lib/prices.ts`의 실시간 외부호출을 **DB read로 교체**(현재는 API 직접 호출 + 샘플 폴백).

### 2-5. 신뢰성 체크리스트
- [ ] 멱등 upsert(자연키: 시장+법인+품목+단위+등급+saleDate+seq)
- [ ] 수집 실패/무데이터 알림
- [ ] 타임존 KST 고정
- [ ] 트래픽 한도 모니터링 + 운영계정 신청
- [ ] 표준코드 최신화
- [ ] 원천(raw) 보존 → 언제든 재집계 가능

---

## 3. 지금 할 일 vs 키 발급 후 할 일

**지금(키 없이) 가능**
- 코드의 소스 어댑터를 aT API 기준으로 재정렬(현재 garak 어댑터 → aT 어댑터), 파서 단위테스트.
- DB 스키마/마이그레이션 초안, 수집 job 골격(드라이런), 샘플 폴백 유지.

**serviceKey 발급 후**
- aT 실호출로 응답 컬럼/시장·품목 코드 확정, 파서 매핑 검증.
- 수집 job 실가동 → `raw_auction` 적재 시작 → 자체 평년가 축적.

## 4. 환경변수 요약
```
# 필수
DATA_GO_KR_SERVICE_KEY=        # aT 전국 공영도매시장 실시간 경매정보 (+표준코드)
KAMIS_CERT_KEY=                # KAMIS 인증키
KAMIS_CERT_ID=                 # KAMIS 요청자 ID
# 선택(수산 산지 위판 확장 시)
# 위 serviceKey로 해수부/부산 API도 공용 가능(포털 단일 키)
```
