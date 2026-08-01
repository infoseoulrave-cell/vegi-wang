import { NextResponse } from "next/server";
import { getEnv } from "@/server/config/env";
import { todayKST } from "@/server/domain/date";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 산지가격(농가수취가) 축 확보 가능성 진단.
 *
 * 배경: 화면의 "소매 ÷ 경락" 배수는 유통의 마지막 구간만 본다.
 * 경락가는 소비자가를 100으로 놓았을 때 이미 63 지점이고,
 * 나머지 63은 산지·출하 단계에서 결정된다(aT 유통실태조사 2024 기준
 * 유통비용률 49.2%, 엽근채소 64.3%).
 *
 * 전 구간을 보여주려면 축 앞쪽에 산지가격이 필요하다.
 * KAMIS가 그걸 어느 수준까지 주는지 확인되지 않아, 후보 action을 실제로
 * 호출해 응답 형태를 덤프한다. 여기서 품목·가격·단위가 잡히면 어댑터를 만든다.
 *
 * 키는 프로덕션 환경변수에만 있으므로 배포본에서 호출해야 의미가 있다.
 */
const ENDPOINT = "https://www.kamis.or.kr/service/price/xml.do";

/** KAMIS 문서에 등장하거나 관례적으로 쓰이는 후보들 */
const CANDIDATE_ACTIONS = [
  // 산지(농가판매) 계열 후보
  "areaPriceList",
  "originPriceList",
  "farmPriceList",
  "dailySalesList",
  // 대조군 — 이미 동작이 확인된 것. 이게 실패하면 키/네트워크 문제다.
  "dailyPriceByCategoryList",
] as const;

type Probe = {
  action: string;
  httpStatus: number | null;
  ok: boolean;
  /** 응답이 JSON으로 파싱되는가 */
  parsed: boolean;
  /** 최상위 키 — 데이터 형태 판별용 */
  topLevelKeys: string[];
  /** 표본 레코드의 필드명 — 여기에 가격/단위/품목이 있으면 쓸 수 있다 */
  sampleFields: string[];
  rowCount: number | null;
  note: string;
};

function firstArray(value: unknown, depth = 0): unknown[] | null {
  if (depth > 4 || value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = firstArray(v, depth + 1);
      if (found && found.length) return found;
    }
  }
  return null;
}

async function probe(
  action: string,
  certKey: string,
  certId: string,
  date: string,
): Promise<Probe> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("action", action);
  url.searchParams.set("p_cert_key", certKey);
  url.searchParams.set("p_cert_id", certId);
  url.searchParams.set("p_returntype", "json");
  url.searchParams.set("p_regday", date);
  url.searchParams.set("p_convert_kg_yn", "N");

  const base: Probe = {
    action,
    httpStatus: null,
    ok: false,
    parsed: false,
    topLevelKeys: [],
    sampleFields: [],
    rowCount: null,
    note: "",
  };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    base.httpStatus = res.status;
    const text = await res.text();

    if (!res.ok) {
      base.note = `HTTP ${res.status}`;
      return base;
    }
    // KAMIS는 잘못된 action에 에러 문자열이나 빈 응답을 준다
    if (!text.trim()) {
      base.note = "빈 응답 — action이 존재하지 않을 가능성";
      return base;
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      base.note = `JSON 아님 (앞 120자: ${text.slice(0, 120)})`;
      return base;
    }

    base.parsed = true;
    base.topLevelKeys =
      json && typeof json === "object" && !Array.isArray(json)
        ? Object.keys(json as Record<string, unknown>)
        : [];

    const rows = firstArray(json);
    base.rowCount = rows ? rows.length : 0;
    const sample = rows?.find((r) => r && typeof r === "object");
    base.sampleFields = sample
      ? Object.keys(sample as Record<string, unknown>)
      : [];
    base.ok = Boolean(rows && rows.length);
    base.note = base.ok
      ? "데이터 있음 — sampleFields에 품목·가격·단위가 있는지 확인할 것"
      : "응답은 왔으나 레코드 없음 (휴장일이거나 미지원 action)";
    return base;
  } catch (err) {
    base.note = err instanceof Error ? err.message : String(err);
    return base;
  }
}

export async function GET(request: Request) {
  const env = getEnv();
  const certKey = env.kamis.key;
  const certId = env.kamis.id;

  if (!certKey || !certId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "KAMIS 자격증명 없음 — 로컬 .env.local은 비어 있다. 배포본에서 호출할 것.",
      },
      { status: 503 },
    );
  }

  const date = new URL(request.url).searchParams.get("date") ?? todayKST();
  const probes = await Promise.all(
    CANDIDATE_ACTIONS.map((a) => probe(a, certKey, certId, date)),
  );

  const control = probes.find((p) => p.action === "dailyPriceByCategoryList");
  const usable = probes.filter(
    (p) => p.ok && p.action !== "dailyPriceByCategoryList",
  );

  return NextResponse.json({
    date,
    /* 대조군이 실패하면 아래 결과는 전부 무의미하다 */
    controlHealthy: Boolean(control?.parsed),
    verdict: usable.length
      ? `산지가격 후보 ${usable.length}건 응답 — sampleFields 확인 후 어댑터 작성 가능`
      : "산지가격 계열 action이 응답하지 않음 — aT 유통실태조사 원자료 등 대안 필요",
    usableActions: usable.map((p) => p.action),
    probes,
  });
}
