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

export function RetailGapBadge({ level }: { level: RetailGapLevel }) {
  const meta = RETAIL_GAP_META[level];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}
