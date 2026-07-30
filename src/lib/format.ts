/**
 * 금액 표시. 값이 없으면 숫자를 지어내지 않고 "—"를 보여준다.
 * 결측을 0원이나 임의값으로 뭉개면 소비자가 그걸 실제 시세로 읽는다.
 */
export function won(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function signedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

/** 소매÷도매 배수 표시 (결측이면 "—") */
export function multiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value}배`;
}

/**
 * 가격 신선도 라벨. carried면 언제 값인지 반드시 밝힌다.
 * 예: "7/29 경락가 기준"
 */
export function priceStatusLabel(
  status: "live" | "carried" | "missing",
  asOfDate?: string,
): string | null {
  if (status !== "carried" || !asOfDate) return null;
  const [, m, d] = asOfDate.split("-");
  return `${Number(m)}/${Number(d)} 경락가 기준`;
}

/** 기준선 근거 라벨 — 어떤 기준으로 비교했는지 숨기지 않는다 */
export function baselineLabel(
  method: "kamis_dpr7" | "moving_avg_30" | "seasonal" | "none",
): string | null {
  switch (method) {
    case "kamis_dpr7":
      return "KAMIS 평년 기준";
    case "moving_avg_30":
      return "최근 30일 기준";
    case "seasonal":
      return "평년 기준";
    default:
      return null;
  }
}
