"use client";

import { useState } from "react";

const INTERESTS = ["채소", "과일", "수산", "전체"];

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("전체");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, interest }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "잠시 후 다시 시도해 주세요.");
        return;
      }
      setStatus("done");
      setMessage(
        `신청 완료! 현재 ${data.total.toLocaleString("ko-KR")}명이 아침 시세 알림을 기다리고 있어요.`,
      );
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl bg-brand/10 p-6 text-center ring-1 ring-brand/20">
        <p className="text-lg font-bold text-brand-dark">🌱 {message}</p>
        <p className="mt-1 text-sm text-foreground/60">
          매일 아침 경매 마감 직후, 관심 품목의 &lsquo;사기 좋은 날&rsquo;을
          메일로 보내드립니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((it) => (
          <button
            key={it}
            type="button"
            onClick={() => setInterest(it)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              interest === it
                ? "bg-brand text-white"
                : "bg-white text-foreground/60 ring-1 ring-black/10"
            }`}
          >
            {it}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일 주소"
          className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="shrink-0 rounded-xl bg-brand px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
        >
          {status === "loading" ? "신청 중…" : "아침 시세 알림 받기"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-sm font-medium text-rose-600">{message}</p>
      )}
      <p className="text-xs text-foreground/45">
        관심 품목은 베지왕의 &lsquo;소비자 니즈 DB&rsquo;로 쌓여, 향후 사입·판매
        연결의 기반이 됩니다.
      </p>
    </form>
  );
}
