import { COMPASS_META, RETAIL_GAP_META } from "@/lib/compass";
import type { CompassLevel, RetailGapLevel } from "@/lib/types";

export function CompassBadge({ level }: { level: CompassLevel }) {
  const meta = COMPASS_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.tone}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

/** 소매가가 없으면 거품 판정 근거가 없다 — 배지를 아예 그리지 않는다 */
export function RetailGapBadge({ level }: { level?: RetailGapLevel }) {
  if (!level) return null;
  const meta = RETAIL_GAP_META[level];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}
