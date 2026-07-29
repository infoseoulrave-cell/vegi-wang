<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

베지왕(Vegi-Wang): Next.js 16 (App Router) + React 19 + Tailwind v4 랜딩페이지. 공영도매시장 경매가를 "가격 나침반"으로 소비자에게 노출하고 관심 품목(니즈)을 수집한다.

- 실행/검증 명령은 `package.json` 스크립트 참고: `npm run dev` (Turbopack, http://localhost:3000), `npm run lint`, `npm run build`, `npm test`(vitest). Next 16은 dev/build 모두 Turbopack을 사용한다.
- 백엔드 구조는 `docs/BACKEND.md` + `src/server/` 참고. 시세 서빙은 `getServedPriceFeed`(DB `daily_item_price` 우선) → 없으면 `src/lib/prices.ts` 실시간 폴백. 수집은 `/api/cron/ingest`(Vercel Cron 08:00 KST)가 aT→garak 순으로 `raw_auction`에 멱등 upsert 후 집계.
- 실시간 폴백 필드 조합: 경락가=가락/aT(`src/lib/sources/*`), 평년·소매=KAMIS. 샘플 오버레이·파서 단위테스트·나침반 임계값(`compass.ts`, ±10% / 1.8·2.5)은 기존과 동일. 가락은 계정(id/passwd)+dataid 인증.
- 대기자: `DATABASE_URL` 있으면 Postgres `waitlist`, 없으면 `.data/waitlist.json`(+인메모리 폴백).
- 기준일은 KST(`src/server/domain/date.ts`). 스토리지: `DATABASE_URL`→Postgres, 없으면 메모리 리포지.
