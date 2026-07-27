/**
 * 경매 거래단량(UUN) 문자열을 kg으로 환산한다.
 * 예: "10kg" → 10, "10kg 그물망" → 10, "500g" → 0.5, "1.2 kg" → 1.2
 * 개/미/속/단 등 중량으로 환산할 수 없는 단위는 null (원/kg 집계에서 제외).
 */
export function parseUnitKg(unit: string): number | null {
  if (!unit) return null;
  const kg = unit.match(/([\d.]+)\s*kg/i);
  if (kg) {
    const n = parseFloat(kg[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const g = unit.match(/([\d.]+)\s*g(?![a-z])/i);
  if (g) {
    const n = parseFloat(g[1]);
    return Number.isFinite(n) && n > 0 ? n / 1000 : null;
  }
  return null;
}

/** {가격, 단위, 수량} 행들을 원/kg로 환산 후 수량 가중평균한다. */
export function weightedPerKg(
  rows: Array<{ price: number; unit: string; qty?: number }>,
): number | null {
  let sum = 0;
  let weight = 0;
  for (const r of rows) {
    const kg = parseUnitKg(r.unit);
    if (!kg || !r.price) continue;
    const perKg = r.price / kg;
    const w = r.qty && r.qty > 0 ? r.qty : 1;
    sum += perKg * w;
    weight += w;
  }
  return weight > 0 ? Math.round(sum / weight) : null;
}
