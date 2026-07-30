"use client";

import { useMemo, useState, type FormEvent } from "react";
import { SAMPLE_ITEMS } from "@/lib/sample-data";

const CATEGORIES = ["채소", "과일", "수산", "전체"] as const;

/** 관심 품목 저가권 알림 — 카테고리 + 개별 품목 선택 */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("전체");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const itemChoices = useMemo(() => {
    const list =
      category === "전체"
        ? SAMPLE_ITEMS
        : SAMPLE_ITEMS.filter((i) => i.category === category);
    return list.slice(0, 18);
  }, [category]);

  function toggleItem(id: string) {
    setItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 8),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    const names = SAMPLE_ITEMS.filter((i) => itemIds.includes(i.id)).map(
      (i) => i.name,
    );
    const interest =
      names.length > 0
        ? `${category}|${names.join(",")}`
        : category;

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
        names.length
          ? `${names.slice(0, 3).join("·")}${names.length > 3 ? " 외" : ""} 저가권 알림을 신청했어요. (대기 ${data.total.toLocaleString("ko-KR")}명)`
          : `신청 완료! 현재 ${data.total.toLocaleString("ko-KR")}명이 아침 시세 알림을 기다리고 있어요.`,
      );
      setEmail("");
      setItemIds([]);
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
          관심 품목이 최근 저가권에 들어오면 아침 메일로 알려드릴게요.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold text-foreground/50">관심 부류</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((it) => (
            <button
              key={it}
              type="button"
              onClick={() => {
                setCategory(it);
                setItemIds([]);
              }}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                category === it
                  ? "bg-brand text-white"
                  : "bg-white text-foreground/60 ring-1 ring-black/10"
              }`}
            >
              {it}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold text-foreground/50">
          저가권 알림 받을 품목 (최대 8개, 선택)
        </p>
        <div className="flex flex-wrap gap-2">
          {itemChoices.map((it) => {
            const on = itemIds.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => toggleItem(it.id)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                  on
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-foreground/60 ring-1 ring-black/10"
                }`}
              >
                {it.name}
              </button>
            );
          })}
        </div>
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
          {status === "loading" ? "신청 중…" : "저가권 알림 받기"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-sm font-medium text-rose-600">{message}</p>
      )}
      <p className="text-xs text-foreground/45">
        품목을 고르면 해당 품목이 최근 저가권일 때 우선 알림합니다. 선택하지
        않으면 부류 전체 요약을 보내드려요.
      </p>
    </form>
  );
}
