<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

베지왕(Vegi-Wang): Next.js 16 (App Router) + React 19 + Tailwind v4 랜딩페이지. 공영도매시장 경매가를 "가격 나침반"으로 소비자에게 노출하고 관심 품목(니즈)을 수집한다.

- 실행/검증 명령은 `package.json` 스크립트 참고: `npm run dev` (Turbopack, http://localhost:3000), `npm run lint`, `npm run build`, `npm test`(vitest). Next 16은 dev/build 모두 Turbopack을 사용한다.
- 시세 데이터(`src/lib/prices.ts`)는 두 소스를 필드별로 조합한다: 경락가(오늘/전일)=가락시장 경매결과(`src/lib/sources/garak.ts`, XML, `GARAK_API_ID`/`GARAK_API_PW`/`GARAK_AUCTION_DATAID`), 평년 기준가+소매가=KAMIS(`src/lib/sources/kamis.ts`, JSON, `KAMIS_CERT_KEY`/`KAMIS_CERT_ID`). 각 값은 `src/lib/sample-data.ts` 위에 오버레이되고, 키가 없거나 실패하면 해당 값만 샘플 유지(보드에 "샘플 데이터" 배지). 가락은 data.go.kr serviceKey가 아니라 가락 계정(id/passwd)+dataid 인증임에 유의. 소스 파서는 순수함수로 분리되어 `*.test.ts`로 검증하므로, 필드 매핑을 바꾸면 테스트도 갱신할 것. 나침반 임계값은 `src/lib/compass.ts`(평년 대비 ±10%, 소매/경락 배수 1.8/2.5).
- 대기자(니즈 DB) 저장(`src/lib/waitlist.ts`): 로컬 `.data/waitlist.json`(gitignore됨)에 append. 파일시스템이 읽기전용(예: 서버리스)인 경우 인메모리로 폴백하므로 프로세스 재시작 시 초기화된다 — 정식 단계에서는 DB로 교체 필요.
- 기준일은 KST(UTC+9)로 계산한다(`todayKST`).
