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

/**
 * DATABASE_URL이 **실제로 쓸 수 있는 형태인지**까지 본다.
 *
 * 존재 여부만 확인하면 망가진 값이 Postgres 클라이언트로 넘어가
 * URL 파싱 단계에서 던지고, 그게 페이지 프리렌더를 죽여 배포 전체가 실패한다.
 * 실제로 그렇게 됐다 — 값 칸에 "DATABASE_URL=postgresql://..." 처럼
 * 키 이름째 붙여넣으면 ERR_INVALID_URL이 난다.
 *
 * 형식이 틀리면 DB가 없는 것으로 취급해 메모리 리포지로 물러난다.
 * 서비스는 계속 뜨고, 로그에 사유가 남는다.
 */
export function isUsableDatabaseUrl(raw: string | null | undefined): boolean {
  const url = raw?.trim();
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      return false;
    }
    if (!parsed.hostname) return false;
    /*
     * new URL은 '[YOUR-PASSWORD]' 같은 자리표시자를 그대로 통과시킨다.
     * 그 상태로 접속하면 인증 실패만 반복되므로 여기서 거른다.
     * 대괄호는 userinfo에 정상적으로 쓰이지 않는다.
     */
    // URL이 대괄호를 %5B/%5D로 인코딩하므로 디코딩한 뒤 본다
    let userinfo = `${parsed.username}${parsed.password}`;
    try {
      userinfo = decodeURIComponent(userinfo);
    } catch {
      // 디코딩 불가한 값은 그대로 검사
    }
    if (userinfo.includes("[") || userinfo.includes("]")) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * DATABASE_URL이 왜 거부됐는지 **값을 노출하지 않고** 알려준다.
 * 형식 문제는 흔한데 값을 볼 수 없어 진단이 어렵다 — 구조만 보고한다.
 */
export function describeDatabaseUrl(): {
  present: boolean;
  length: number;
  scheme: string | null;
  startsWithKeyName: boolean;
  hasBrackets: boolean;
  hasWhitespace: boolean;
  valid: boolean;
} {
  const raw = getEnv().databaseUrl ?? "";
  const url = raw.trim();
  let scheme: string | null = null;
  try {
    scheme = new URL(url).protocol.replace(":", "");
  } catch {
    scheme = null;
  }
  return {
    present: Boolean(raw),
    length: url.length,
    scheme,
    startsWithKeyName: /^DATABASE_URL\s*=/i.test(url),
    hasBrackets: /[[\]]/.test(decodeURIComponent(url.replace(/%/g, "%25"))),
    hasWhitespace: /\s/.test(url),
    valid: isUsableDatabaseUrl(raw),
  };
}

let warnedBadUrl = false;

export function hasDatabase(): boolean {
  const url = getEnv().databaseUrl;
  if (!url) return false;
  if (isUsableDatabaseUrl(url)) return true;
  if (!warnedBadUrl) {
    warnedBadUrl = true;
    console.error(
      "[env] DATABASE_URL 형식이 올바르지 않아 메모리 저장소로 폴백합니다. " +
        "값에 'DATABASE_URL=' 접두어나 대괄호가 섞이지 않았는지 확인하세요. " +
        "기대 형식: postgresql://user:password@host:5432/dbname",
    );
  }
  return false;
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
