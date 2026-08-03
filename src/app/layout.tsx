import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { SITE_URL, siteVerification } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const verification = siteVerification();

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "베지왕 — 가락 경매가로 오늘 살 타이밍",
    template: "%s | 베지왕",
  },
  description:
    "가락 아침 경매가와 최근 추세로 담기·관망 타이밍을 알려드립니다. 품목별 시세·그래프 공개. 저가권·오픈 알림 얼리 액세스 모집.",
  keywords: [
    "가락시장 경매가",
    "농수산물 시세",
    "장보기 타이밍",
    "채소 가격",
    "과일 시세",
    "베지왕",
  ],
  alternates: { canonical: SITE_URL },
  ...(verification ? { verification } : {}),
  openGraph: {
    title: "베지왕 — 가락 경매가로 오늘 살 타이밍",
    description:
      "담기 좋은 날·관망할 날을 공개합니다. 오늘 타이밍 → vegi-wang.vercel.app/today",
    url: SITE_URL,
    type: "website",
    locale: "ko_KR",
    siteName: "베지왕",
  },
  twitter: {
    card: "summary_large_image",
    title: "베지왕 — 오늘 장보기 타이밍",
    description: "가락 경매가 기준 담기·관망. /today 에서 확인",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "베지왕",
      url: SITE_URL,
      description:
        "가락 아침 경매가 기반 장보기·매입 타이밍 플랫폼",
      inLanguage: "ko-KR",
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/items/{id}`,
        "query-input": "required name=id",
      },
    },
    {
      "@type": "Organization",
      name: "서울레이브",
      url: SITE_URL,
      email: "gallery.jeoul@gmail.com",
      address: {
        "@type": "PostalAddress",
        addressLocality: "해운대구",
        addressRegion: "부산광역시",
        addressCountry: "KR",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/variable/pretendardvariable.min.css"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <AnalyticsProviders />
      </body>
    </html>
  );
}
