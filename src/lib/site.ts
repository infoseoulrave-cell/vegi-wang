/** 공개 사이트 베이스 URL (SEO·sitemap·canonical 공통) */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://vegi-wang.vercel.app";

/** layout metadata.verification 용 */
export function siteVerification():
  | { google?: string; other?: Record<string, string> }
  | undefined {
  const google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  const naver = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION?.trim();
  if (!google && !naver) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(naver
      ? { other: { "naver-site-verification": naver } }
      : {}),
  };
}
