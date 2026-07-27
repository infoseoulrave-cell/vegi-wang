export function won(value: number): string {
  return `${value.toLocaleString("ko-KR")}원`;
}

export function signedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}
