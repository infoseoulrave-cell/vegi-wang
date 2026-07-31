import { signedPct } from "@/lib/format";

/**
 * 전일 대비 등락률.
 *
 * 값이 없으면 **아무것도 그리지 않는다.** 예전에는 전일값이 없을 때 오늘 값을
 * 대신 넣어 "전일 0%"를 표시했는데, "변동 없음"과 "전일 데이터 없음"은
 * 다른 사실이다. 원천이 다른 값끼리 비교해 만든 등락률도 마찬가지로 감춘다.
 */
export function ChangeRate({
  value,
  className = "text-sm",
}: {
  value?: number;
  className?: string;
}) {
  if (value == null) return null;
  const tone =
    value < 0
      ? "text-emerald-600"
      : value > 0
        ? "text-rose-600"
        : "text-foreground/50";
  return (
    <p className={`${className} font-semibold ${tone}`}>
      전일 {signedPct(value)}
    </p>
  );
}
