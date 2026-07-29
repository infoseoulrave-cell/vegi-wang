/** KST(UTC+9) 일자 유틸 — 비즈니스 일자는 항상 이 모듈을 사용 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date → KST YYYY-MM-DD */
export function toKstDateISO(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 기준 오늘 */
export function todayKST(): string {
  return toKstDateISO(new Date());
}

/** YYYY-MM-DD 기준 N일 전 (정오 KST 앵커로 오프바이원 방지) */
export function addDaysISO(dateISO: string, deltaDays: number): string {
  const anchor = new Date(`${dateISO}T12:00:00+09:00`);
  return toKstDateISO(new Date(anchor.getTime() + deltaDays * 24 * 60 * 60 * 1000));
}

export function yesterdayKST(dateISO?: string): string {
  return addDaysISO(dateISO ?? todayKST(), -1);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateISO(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00+09:00`);
  return !Number.isNaN(d.getTime()) && toKstDateISO(d) === s;
}
