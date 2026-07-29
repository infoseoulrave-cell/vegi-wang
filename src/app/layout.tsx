import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "베지왕 — 오늘 아침 농수산물 경매가, 사기 좋은 날인지 알려드립니다",
  description:
    "가락시장 등 공영도매시장의 매일 아침 경매가를 소비자의 언어로 번역합니다. 배추·사과·고등어… 지금이 싼지 비싼지 '가격 나침반'으로 한눈에.",
  keywords: [
    "농수산물 가격",
    "가락시장 경매가",
    "오늘 농산물 시세",
    "채소 과일 수산 시세",
    "베지왕",
  ],
  openGraph: {
    title: "베지왕 — 오늘의 농수산물 경매가 나침반",
    description:
      "매일 아침 도매시장 경매가를 소비자에게. 지금이 사기 좋은 날인지 알려드립니다.",
    type: "website",
  },
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
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
