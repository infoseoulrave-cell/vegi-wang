import { NextResponse } from "next/server";
import { fetchGarakAuction } from "@/lib/sources/garak";
import { probeKamis } from "@/lib/sources/kamis";
import { getEnv, preferredAuctionSource } from "@/server/config/env";
import { todayKST } from "@/server/domain/date";

export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

/**
 * 데이터 소스 연결 진단 (시크릿 미노출).
 * 운영 확인용 — 키가 보이는 값은 반환하지 않는다.
 */
export async function GET() {
  const date = todayKST();
  const env = getEnv();

  const [kamis, cabbage] = await Promise.all([
    probeKamis(date),
    fetchGarakAuction("배추", date),
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
    kamis,
  });
}
