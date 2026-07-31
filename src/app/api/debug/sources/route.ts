import { NextResponse } from "next/server";
import { fetchGarakAuctionPerKg } from "@/lib/sources/garak";
import { probeKamis, probeKamisRetail } from "@/lib/sources/kamis";
import { getEnv, preferredAuctionSource } from "@/server/config/env";
import { todayKST } from "@/server/domain/date";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

/**
 * 데이터 소스 연결 진단 (시크릿 미노출).
 * 운영 확인용 — 키가 보이는 값은 반환하지 않는다.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? todayKST();

  /*
   * ?items=감자,고구마,느타리버섯 → 임의 품목의 가락 경락가 조회 가능 여부 확인.
   * 카탈로그 확장 전에 "KAMIS에 도매가가 있다"와 "우리가 경락가를 얻을 수 있다"를
   * 구분하기 위한 경로다. 가락은 청과 6개 법인만 조회하므로 양곡·특용작물은
   * 안 잡힐 수 있고, 그건 추가 불가를 뜻한다.
   */
  const itemsParam = url.searchParams.get("items");
  if (itemsParam) {
    const names = itemsParam
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 20);
    const results = [];
    for (const name of names) {
      const perKg = await fetchGarakAuctionPerKg(name, date);
      results.push({
        name,
        garakPerKg: perKg,
        tradable: perKg != null,
      });
    }
    return NextResponse.json({
      date,
      checked: results.length,
      tradable: results.filter((r) => r.tradable).map((r) => r.name),
      notTradable: results.filter((r) => !r.tradable).map((r) => r.name),
      results,
    });
  }

  const env = getEnv();

  const [kamisWholesale, kamisRetail, cabbage] = await Promise.all([
    probeKamis(date),
    probeKamisRetail(date),
    fetchGarakAuctionPerKg("배추", date),
  ]);

  return NextResponse.json({
    date,
    regionHint: "icn1",
    preferredAuctionSource: preferredAuctionSource(),
    credentials: {
      at: Boolean(env.dataGoKrServiceKey),
      garak: Boolean(env.garak.id && env.garak.pw && env.garak.dataid),
      kamis: Boolean(env.kamis.key && env.kamis.id),
    },
    garak: {
      ok: cabbage != null,
      sampleItem: "배추",
      avgPrice: cabbage,
    },
    kamisWholesale,
    kamisRetail,
  });
}
