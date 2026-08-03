"use client";

import { track } from "@vercel/analytics";
import { useState } from "react";

type Props = {
  title: string;
  text: string;
  /** 상대경로 또는 절대 URL. 비우면 현재 페이지 */
  path?: string;
  className?: string;
  label?: string;
};

export function ShareLinkButton({
  title,
  text,
  path,
  className = "",
  label = "공유하기",
}: Props) {
  const [copied, setCopied] = useState(false);

  function trackShare(method: "native" | "clipboard") {
    try {
      track("share", { method, path: path ?? "current" });
    } catch {
      /* ignore */
    }
  }

  async function onShare() {
    const url =
      path && path.startsWith("http")
        ? path
        : `${window.location.origin}${path ?? window.location.pathname}`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        trackShare("native");
        return;
      }
    } catch {
      /* 사용자가 취소한 경우 등은 복사로 폴백하지 않음 */
      return;
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      trackShare("clipboard");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className={className}
    >
      {copied ? "링크 복사됨" : label}
    </button>
  );
}
