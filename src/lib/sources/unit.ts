/**
 * 단위 문자열 파싱 — 가격 축 정규화의 단일 진입점.
 *
 * 설계 원칙(docs/superpowers/specs/2026-07-31-price-axis-and-baseline-design.md):
 * 내부 표준축은 원/kg 하나다. 나눗셈은 소스 어댑터 안에서만 일어나고,
 * 그 뒤로는 곱하기만 한다. 여기가 그 나눗셈의 근거를 만드는 곳이다.
 */

/** 개수 기반 단위로 인정하는 조사 단위 */
const COUNT_UNIT_PATTERN = /(포기|개|단|마리|팩|송이|손|접|망|박스|상자|봉)/;

/**
 * 거래단량 문자열을 kg으로 환산한다.
 * 예: "10kg" → 10, "10kg(그물망 3포기)" → 10, "500g" → 0.5, "1.2 kg" → 1.2
 * 개/미/속/단 등 중량으로 환산할 수 없는 단위는 null.
 *
 * null은 "모른다"는 뜻이지 1이 아니다. 호출측은 null을 1로 대체하면 안 된다.
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

/** 중량으로 환산 가능한 단위인가 */
export function isWeightUnit(unit: string): boolean {
  return parseUnitKg(unit) != null;
}

/**
 * 개수 기반 단위의 개수를 뽑는다. "10개" → 10, "1포기" → 1, "포기" → 1.
 * 개수 단위가 아니면 null (중량 단위와 구분하기 위해 0/1로 뭉개지 않는다).
 */
export function parseUnitCount(unit: string): number | null {
  if (!unit || isWeightUnit(unit)) return null;
  if (!COUNT_UNIT_PATTERN.test(unit)) return null;
  const m = unit.match(/(\d+(?:\.\d+)?)\s*(?=포기|개|단|마리|팩|송이|손|접|망|박스|상자|봉)/);
  if (!m) return 1;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * 단위 문자열 1건의 총 중량(kg)을 구한다.
 * - 중량 단위면 그 값
 * - 개수 단위면 개수 × 카탈로그 검증 중량(kgPerPiece)
 * - 카탈로그 값이 없으면 null — 추정하지 않는다
 */
export function unitTotalKg(
  unit: string,
  kgPerPiece?: number | null,
): number | null {
  const direct = parseUnitKg(unit);
  if (direct != null) return direct;

  const count = parseUnitCount(unit);
  if (count == null) return null;
  if (!kgPerPiece || !(kgPerPiece > 0)) return null;
  return count * kgPerPiece;
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
