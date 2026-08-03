"use client";

import { track } from "@vercel/analytics";
import { useMemo, useState, type FormEvent } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";

const CATEGORIES = ["채소", "과일", "수산", "전체"] as const;
const ROLES = [
  { id: "consumer", label: "소비자 · 장보기" },
  { id: "business", label: "사업자 · 매입" },
] as const;

/** 오픈 전 얼리 액세스 — 역할 + 관심 품목 */
export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]["id"]>("consumer");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("전체");
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const itemChoices = useMemo(() => {
    const list =
      category === "전체"
        ? CATALOG_ITEMS
        : CATALOG_ITEMS.filter((i) => i.category === category);
    return list.slice(0, 18);
  }, [category]);

  function toggleItem(id: string) {
    setItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(0, 8),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setStatus("error");
      setMessage("개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setStatus("loading");
    setMessage("");
    const names = CATALOG_ITEMS.filter((i) => itemIds.includes(i.id)).map(
      (i) => i.name,
    );
    const interest =
      names.length > 0
        ? `${role}|${category}|${names.join(",")}`
        : `${role}|${category}`;

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, interest, consent: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "잠시 후 다시 시도해 주세요.");
        return;
      }
      setStatus("done");
      setMessage(
        role === "business"
          ? `사업자 얼리 액세스에 등록했어요. (대기 ${data.total.toLocaleString("ko-KR")}명)`
          : `오픈 알림을 신청했어요. (대기 ${data.total.toLocaleString("ko-KR")}명)`,
      );
      try {
        track("waitlist_signup", { role, category });
      } catch {
        /* ignore */
      }
      setEmail("");
      setItemIds([]);
      setAgreed(false);
    } catch {
      setStatus("error");
      setMessage("네트워크 오류가 발생했습니다.");
    }
  }

  if (status === "done") {
    return (
      <div className="border border-brand/25 bg-brand/8 p-6 text-center">
        <p className="text-lg font-bold text-brand-dark">{message}</p>
        <p className="mt-2 text-sm text-foreground/60">
          정식 오픈과 관심 품목 저가권 소식을 메일로 먼저 보내드립니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold text-foreground/50">이용 목적</p>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setRole(it.id)}
              className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${
                role === it.id
                  ? "bg-brand text-white"
                  : "bg-background text-foreground/65 ring-1 ring-black/10"
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      </div>

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
          관심 품목 (최대 8개, 선택)
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
                    ? "bg-emerald-700 text-white"
                    : "bg-white text-foreground/60 ring-1 ring-black/10"
                }`}
              >
                {it.name}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-background/80 p-3 ring-1 ring-black/5">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-brand"
        />
        <span className="text-xs leading-relaxed text-foreground/70">
          <b className="font-semibold text-foreground/90">
            개인정보 수집·이용에 동의합니다.
          </b>{" "}
          수집 항목은 <b>이메일</b>, <b>이용 목적</b>, <b>관심 품목</b>이며, 오픈
          안내·시세 알림·파일럿 안내에만 사용합니다. 수신거부 시 지체 없이
          파기합니다.{" "}
          <a
            href="/privacy"
            className="font-semibold text-brand underline underline-offset-2"
          >
            개인정보처리방침
          </a>
        </span>
      </label>

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
          disabled={status === "loading" || !agreed}
          className="shrink-0 rounded-xl bg-brand px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60"
        >
          {status === "loading" ? "등록 중…" : "얼리 액세스 신청"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-sm font-medium text-rose-600">{message}</p>
      )}
      <p className="text-xs text-foreground/45">
        아직 정식 오픈 전입니다. 등록해 두시면 오픈일과 맞춤 알림을 가장 먼저
        알려드립니다.
      </p>
    </form>
  );
}
