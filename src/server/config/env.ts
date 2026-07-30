/**
 * 서버 환경변수. 런타임에 lazy 평가 — 빌드 시 키가 없어도 통과.
 * 시크릿은 절대 로그/응답에 노출하지 않는다.
 */

export type AuctionSourceKind = "at" | "garak" | "none";

export function getEnv() {
  return {
    databaseUrl: process.env.DATABASE_URL?.trim() || null,
    cronSecret: process.env.CRON_SECRET?.trim() || null,
    dataGoKrServiceKey: process.env.DATA_GO_KR_SERVICE_KEY?.trim() || null,
    garak: {
      id: process.env.GARAK_API_ID?.trim() || null,
      pw: process.env.GARAK_API_PW?.trim() || null,
      dataid: process.env.GARAK_AUCTION_DATAID?.trim() || null,
    },
    kamis: {
      key: process.env.KAMIS_CERT_KEY?.trim() || null,
      id: process.env.KAMIS_CERT_ID?.trim() || null,
    },
    naver: {
      clientId: process.env.NAVER_CLIENT_ID?.trim() || null,
      clientSecret: process.env.NAVER_CLIENT_SECRET?.trim() || null,
    },
    defaultMarketCode: process.env.DEFAULT_MARKET_CODE?.trim() || "110001",
    baselineWindowDays: Number(process.env.BASELINE_WINDOW_DAYS ?? 30) || 30,
  };
}

export function hasDatabase(): boolean {
  return Boolean(getEnv().databaseUrl);
}

export function hasGarakCredentials(): boolean {
  const g = getEnv().garak;
  return Boolean(g.id && g.pw && g.dataid);
}

export function hasAtCredentials(): boolean {
  return Boolean(getEnv().dataGoKrServiceKey);
}

/** 네이버 쇼핑 소매가 채널 — 없으면 KAMIS 소매가만 사용 */
export function hasNaverCredentials(): boolean {
  const n = getEnv().naver;
  return Boolean(n.clientId && n.clientSecret);
}

export function preferredAuctionSource(): AuctionSourceKind {
  if (hasAtCredentials()) return "at";
  if (hasGarakCredentials()) return "garak";
  return "none";
}
