"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Script from "next/script";

/**
 * Vercel Analytics + Speed Insights는 항상.
 * GA4 / 네이버 분석은 env가 있을 때만 로드.
 */
export function AnalyticsProviders() {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  const naverId = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID?.trim();

  return (
    <>
      <Analytics />
      <SpeedInsights />

      {gaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true });
            `}
          </Script>
        </>
      ) : null}

      {naverId ? (
        <>
          <Script
            src="https://wcs.naver.net/wcslog.js"
            strategy="afterInteractive"
          />
          <Script id="naver-analytics" strategy="afterInteractive">
            {`
              if (!window.wcs_add) window.wcs_add = {};
              window.wcs_add['wa'] = '${naverId}';
              if (!window._nasa) window._nasa = {};
              if (window.wcs) {
                wcs.inflow('vegi-wang.vercel.app');
                wcs_do();
              }
            `}
          </Script>
        </>
      ) : null}
    </>
  );
}
